import axios from "axios";
import tough from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import Tesseract from "tesseract.js";
import * as cheerio from "cheerio";
import qs from "qs";

// Chuẩn hóa biển số: loại bỏ dấu chấm, gạch ngang, khoảng trắng, in hoa
function normalizeBienSo(bienSo) {
  return String(bienSo)
    .replace(/[.\-\s]/g, "")
    .toUpperCase();
}

// Hàm lấy hidden fields
async function getFormFields(instance, url) {
  const res = await instance.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
      Connection: "keep-alive",
    },
  });
  const $ = cheerio.load(res.data);
  return {
    __VIEWSTATE: $("input[name='__VIEWSTATE']").val(),
    __VIEWSTATEGENERATOR: $("input[name='__VIEWSTATEGENERATOR']").val(),
    __EVENTVALIDATION: $("input[name='__EVENTVALIDATION']").val(),
  };
}

// Hàm nhận diện captcha
async function getCaptchaText(instance, url) {
  const res = await instance.get(url, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
      Referer: "http://app.vr.org.vn/ptpublic/thongtinptpublic.aspx",
      Connection: "keep-alive",
    },
  });
  const {
    data: { text },
  } = await Tesseract.recognize(res.data, "eng", {
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  });
  return text.replace(/[^A-Z0-9]/g, "").trim();
}

// Hàm trích xuất thông tin phương tiện từ HTML trả về
function extractVRInfo(html) {
  const $ = cheerio.load(html);

  const error = $("#lblErrMsg").text().trim();
  if (error) return { error };

  const bienSo = $("#LblBinDangKy").text().replace(/^.*:/, "").trim();
  if (!bienSo) return { error: "Không tìm thấy thông tin phương tiện." };

  return {
    bienSo,
    nhanHieu: $("#txtNhanHieu").text().trim(),
    soKhung: $("#txtSoKhung").text().trim(),
    loaiPT: $("#txtLoaiPT").text().trim(),
    soMay: $("#txtSoMay").text().trim(),
    kichThuocBao: $("#txtKichThuocBao").text().trim(),
    kichThuocThung: $("#txtKichThuocThung").text().trim(),
    tuTrong: $("#txtTuTrongTK").text().trim(),
    taiTrongGT: $("#txtTaiTrongGT").text().trim(),
    soCho: $("#txtSoCho").text().trim(),
    trongLuongToanBo: $("#txtTrLgToanBoGT").text().trim(),
    truc_chieuCoSo: $("#txtCdCsCtBx").text().trim(),
    trongLuongMoocCP: $("#txtTrLgMoocCP").text().trim(),
    kiemDinh: {
      ngayKiemDinh: $("#txtNgayKD").text().trim(),
      tramKiemDinh: $("#txtTramKD").text().trim(),
      soTemGCN: $("#txtSoTemGCN").text().trim(),
      hanHieuLucGCN: $("#txtHanKDToi").text().trim(),
    },
    nopPhi: {
      ngayNopPhi: $("#txtNgayNop").text().trim(),
      donViThuPhi: $("#txtDonVi").text().trim(),
      soBienLai: $("#txtBL_ID").text().trim(),
      phiNopDenHetNgay: $("#txtDenNgay").text().trim(),
    },
  };
}

// Hàm chính: lookupVRWithRetry
export async function lookupVRWithRetry({ bienSo, soTem }, maxRetry = 5) {
  if (!bienSo || !soTem) {
    return { error: "Bạn phải nhập đủ cả biển số và số tem!" };
  }

  const bienSoNormalized = normalizeBienSo(bienSo);
  const BASE = "http://app.vr.org.vn/ptpublic/";
  const FORM_URL = BASE + "thongtinptpublic.aspx";
  const CAPTCHA_URL = BASE + "Images/Captchacaptcha1400.jpg";
  const jar = new tough.CookieJar();
  const instance = wrapper(axios.create({ jar, withCredentials: true }));

  let lastError = "";
  for (let i = 0; i < maxRetry; i++) {
    try {
      // 1. Lấy hidden fields
      const fields = await getFormFields(instance, FORM_URL);

      // 2. Lấy captcha và nhận diện
      const captcha = await getCaptchaText(instance, CAPTCHA_URL);

      // 3. Chuẩn bị data POST
      const formData = {
        ...fields,
        txtBienDK: bienSoNormalized,
        TxtSoTem: soTem,
        txtCaptcha: captcha,
        CmdTraCuu: "Tra cứu",
      };

      // 4. Gửi POST
      const res = await instance.post(
        FORM_URL,
        qs.stringify(formData),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": FORM_URL,
            "Origin": "http://app.vr.org.vn",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
            Connection: "keep-alive",
          },
          validateStatus: function (status) {
            return true; // Không throw lỗi cho HTTP status >= 400
          },
        }
      );

      // 5. Nếu 404, log response để debug
      if (res.status === 404) {
        console.error("VR site trả về 404. Response data:", res.data);
        lastError =
          "VR website trả về 404. Có thể bị chặn IP hoặc thay đổi giao diện website.";
        continue;
      }

      // 6. Xử lý kết quả
      const info = extractVRInfo(res.data);
      if (info.error && /mã xác thực|captcha/i.test(info.error)) {
        lastError = info.error;
        continue; // thử lại
      }
      return info;
    } catch (err) {
      if (err.response) {
        console.error("Lỗi HTTP:", err.response.status, err.response.statusText);
        console.error("Body:", err.response.data);
        lastError = `Lỗi HTTP ${err.response.status}`;
      } else {
        lastError = err.message;
      }
    }
  }
  return {
    error:
      lastError ||
      "Không thể vượt captcha hoặc tra cứu sau nhiều lần thử. Có thể IP server đã bị chặn.",
  };
}
