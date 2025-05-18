import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import tough from "tough-cookie";
import Tesseract from "tesseract.js";
import * as cheerio from "cheerio";
import qs from "qs";

/**
 * Trích xuất thông tin phương tiện từ HTML trả về của VR.org.vn
 * @param {string} html
 * @returns {object}
 */
function extractVRInfo(html) {
  const $ = cheerio.load(html);

  // Nếu có thông báo captcha sai
  const captchaError = $("#lblErrMsg").text().trim();
  if (captchaError) {
    return { error: captchaError };
  }

  // Lấy biển số
  const bienSo = $("#LblBinDangKy").text().replace(/^.*:/, "").trim();

  // THÔNG TIN CHUNG
  const nhanHieu = $("#txtNhanHieu").text().trim();
  const soKhung = $("#txtSoKhung").text().trim();
  const loaiPT = $("#txtLoaiPT").text().trim();
  const soMay = $("#txtSoMay").text().trim();

  // THÔNG SỐ KỸ THUẬT
  const kichThuocBao = $("#txtKichThuocBao").text().trim();
  const kichThuocThung = $("#txtKichThuocThung").text().trim();
  const tuTrong = $("#txtTuTrongTK").text().trim();
  const taiTrongGT = $("#txtTaiTrongGT").text().trim();
  const soCho = $("#txtSoCho").text().trim();
  const trongLuongToanBo = $("#txtTrLgToanBoGT").text().trim();
  const truc_chieuCoSo = $("#txtCdCsCtBx").text().trim();
  const trongLuongMoocCP = $("#txtTrLgMoocCP").text().trim();

  // LẦN KIỂM ĐỊNH GẦN NHẤT
  const ngayKiemDinh = $("#txtNgayKD").text().trim();
  const tramKiemDinh = $("#txtTramKD").text().trim();
  const soTemGCN = $("#txtSoTemGCN").text().trim();
  const hanHieuLucGCN = $("#txtHanKDToi").text().trim();

  // LẦN NỘP PHÍ GẦN NHẤT
  const ngayNopPhi = $("#txtNgayNop").text().trim();
  const donViThuPhi = $("#txtDonVi").text().trim();
  const soBienLai = $("#txtBL_ID").text().trim();
  const phiNopDenHetNgay = $("#txtDenNgay").text().trim();

  return {
    bienSo,
    nhanHieu,
    soKhung,
    loaiPT,
    soMay,
    kichThuocBao,
    kichThuocThung,
    tuTrong,
    taiTrongGT,
    soCho,
    trongLuongToanBo,
    truc_chieuCoSo,
    trongLuongMoocCP,
    kiemDinh: {
      ngayKiemDinh,
      tramKiemDinh,
      soTemGCN,
      hanHieuLucGCN,
    },
    nopPhi: {
      ngayNopPhi,
      donViThuPhi,
      soBienLai,
      phiNopDenHetNgay,
    },
  };
}

/**
 * Tra cứu thông tin phương tiện trên http://app.vr.org.vn/ptpublic/
 * Tự động vượt captcha, thử lại tối đa maxRetry lần nếu sai captcha.
 * @param {object} param0 
 * @param {string} param0.bienSo - Biển số xe, VD: "50H-674.72V"
 * @param {string} [param0.soTem] - Số tem (nếu cần)
 * @param {number} [maxRetry] - Số lần thử tối đa (default 5)
 * @returns {Promise<object>} Thông tin phương tiện hoặc lỗi
 */
export async function lookupVRWithRetry({ bienSo, soTem }, maxRetry = 5) {
  const BASE_URL = "http://app.vr.org.vn/ptpublic/";
  const POST_URL = BASE_URL + "thongtinptpublic.aspx";
  const jar = new tough.CookieJar();
  const instance = wrapper(axios.create({ jar, withCredentials: true }));

  let lastError = "";
  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      // 1. Lấy các hidden fields
      const resForm = await instance.get(BASE_URL);
      const $ = cheerio.load(resForm.data);
      const hidden = {
        __VIEWSTATE: $("#__VIEWSTATE").val(),
        __VIEWSTATEGENERATOR: $("#__VIEWSTATEGENERATOR").val(),
        __EVENTVALIDATION: $("#__EVENTVALIDATION").val(),
      };
      // 2. Lấy captcha
      const captchaRes = await instance.get(BASE_URL + "Images/Captchacaptcha1400.jpg", { responseType: "arraybuffer" });
      const result = await Tesseract.recognize(captchaRes.data, "eng");
      const captcha = result.data.text.trim();

      // 3. Gửi form POST
      const formData = {
        ...hidden,
        txtBienDK: bienSo,
        TxtSoTem: soTem || "",
        txtCaptcha: captcha,
        CmdTraCuu: "Tra cứu",
      };
      const res = await instance.post(
        POST_URL,
        qs.stringify(formData),
        { headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": BASE_URL } }
      );

      // 4. Xử lý kết quả
      const info = extractVRInfo(res.data);
      if (info.error && /mã xác thực|captcha/i.test(info.error)) {
        lastError = info.error;
        continue; // thử lại lần nữa
      }
      return info;
    } catch (err) {
      lastError = err.message;
    }
  }
  return { error: lastError || "Không thể vượt captcha sau nhiều lần thử." };
}
