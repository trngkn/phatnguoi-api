import axios from "axios";
import Tesseract from "tesseract.js";
import * as cheerio from "cheerio";
import qs from "qs";

// ... getInitialFormData và getCaptcha giữ nguyên như hướng dẫn trước

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

// Hàm lookup với retry vượt captcha
export async function lookupVRWithRetry({ bienSo, soTem }, maxRetry = 5) {
  const BASE_URL = "http://app.vr.org.vn/ptpublic/";
  let lastError = "";
  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      // 1. Lấy các hidden fields
      const instance = axios.create({ withCredentials: true });
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
        BASE_URL + "thongtinptpublic.aspx",
        qs.stringify(formData),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
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
  // Nếu hết số lần thử vẫn không được
  return { error: lastError || "Không thể vượt captcha sau nhiều lần thử." };
}
