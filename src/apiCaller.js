import axios from "axios";
import Tesseract from "tesseract.js";
import qs from "qs";
import fs from "fs";
import tough from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import { extractTrafficViolations } from "./extractTrafficViotations.js";

const { CookieJar } = tough;

/**
 * Configuration constants
 */
const CONFIG = {
  BASE_URL: "https://www.csgt.vn",
  CAPTCHA_PATH: "/lib/captcha/captcha.class.php",
  FORM_ENDPOINT: "/?mod=contact&task=tracuu_post&ajax",
  RESULTS_URL: "https://www.csgt.vn/tra-cuu-phuong-tien-vi-pham.html",
  MAX_RETRIES: 5,
  HEADERS: {
    USER_AGENT:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    ACCEPT:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    CONTENT_TYPE: "application/x-www-form-urlencoded",
  },
};

/**
 * Creates and configures an axios instance with cookie support
 * @returns {Object} Configured axios instance
 */
function createAxiosInstance() {
  const jar = new CookieJar();
  const instance = axios.create({
    jar,
    withCredentials: true,
    baseURL: CONFIG.BASE_URL,
    headers: {
      "User-Agent": CONFIG.HEADERS.USER_AGENT,
      Accept: CONFIG.HEADERS.ACCEPT,
    },
  });
  return wrapper(instance);
}

/**
 * Fetches and processes captcha image
 * @param {Object} instance - Axios instance
 * @returns {Promise<string>} Recognized captcha text
 */
async function getCaptcha(instance) {
  try {
    const image = await instance.get(CONFIG.CAPTCHA_PATH, {
      responseType: "arraybuffer",
    });

    // Optional: save captcha for debugging
    // fs.writeFileSync("captcha.jpg", Buffer.from(image.data), "binary");

    const captchaResult = await Tesseract.recognize(image.data);
    return captchaResult.data.text.trim();
  } catch (error) {
    throw new Error(`Failed to get or process captcha: ${error.message}`);
  }
}

/**
 * Determines LoaiXe based on the license plate pattern
 * @param {string} plate - License plate number
 * @returns {string} LoaiXe value (1, 2, or 3)
 */
function determineLoaiXe(plate) {
  // Normalize plate (remove spaces, convert to uppercase)
  const normalizedPlate = plate.replace(/\s/g, '').toUpperCase();

  // Regex patterns for each LoaiXe
  const pattern1 = /^\d{2}[A-Z]\d{5}$/; // e.g., 48A25454
  const pattern2 = /^\d{2}[A-Z]\d{6}$/; // e.g., 48A254546
  const pattern3 = /^\d{2}MĐ\d{5}$/;    // e.g., 48MĐ25454

  if (pattern1.test(normalizedPlate)) {
    return '1';
  } else if (pattern2.test(normalizedPlate)) {
    return '2';
  } else if (pattern3.test(normalizedPlate)) {
    return '3';
  } else {
    console.warn(`Unknown plate format: ${plate}. Defaulting to LoaiXe=1`);
    return '1';
  }
}

/**
 * Submits form data with plate number and captcha
 * @param {Object} instance - Axios instance
 * @param {string} plate - License plate number
 * @param {string} captcha - Recognized captcha text
 * @returns {Promise<Object>} API response
 */
async function postFormData(instance, plate, captcha) {
  const loaiXe = determineLoaiXe(plate); // Dynamically determine LoaiXe
  const formData = qs.stringify({
    BienKS: plate,
    Xe: loaiXe,
    captcha,
    ipClient: "9.9.9.91",
    cUrl: "1",
  });

  return instance.post(CONFIG.FORM_ENDPOINT, formData, {
    headers: {
      "Content-Type": CONFIG.HEADERS.CONTENT_TYPE,
    },
  });
}

/**
 * Fetches traffic violation results
 * @param {Object} instance - Axios instance
 * @param {string} plate - License plate number
 * @param {string} loaiXe - LoaiXe value
 * @returns {Promise<Object>} Results page response
 */
async function getViolationResults(instance, plate, loaiXe) {
  return instance.get(`${CONFIG.RESULTS_URL}?&LoaiXe=${loaiXe}&BienKiemSoat=${plate}`);
}

/**
 * Main function to call the traffic violation API
 * @param {string} plate - License plate number
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<Object|null>} Extracted traffic violations or null on failure
 */
export async function callAPI(plate, retries = CONFIG.MAX_RETRIES) {
  try {
    console.log("Fetching traffic violations for plate:", plate);
    const instance = createAxiosInstance();
    const captcha = await getCaptcha(instance);
    // console.log(`Using captcha: ${captcha}`);

    const response = await postFormData(instance, plate, captcha);

    // Handle failed captcha case
    if (response.data === 404) {
      if (retries > 0) {
        console.log(
          `Captcha verification failed ${captcha}. Retrying... (${
            CONFIG.MAX_RETRIES - retries + 1
          }/${CONFIG.MAX_RETRIES})`
        );
        return callAPI(plate, retries - 1);
      } else {
        throw new Error(
          "Maximum retry attempts reached. Could not verify captcha."
        );
      }
    }

    const loaiXe = determineLoaiXe(plate); // Determine LoaiXe for results
    const resultsResponse = await getViolationResults(instance, plate, loaiXe);
    const violations = extractTrafficViolations(resultsResponse.data);

    return violations;
  } catch (error) {
    console.error(
      `Error fetching traffic violations for plate ${plate}:`,
      error.message
    );
    return null;
  }
}
