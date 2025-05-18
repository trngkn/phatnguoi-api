import axios from "axios";
import tough from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import Tesseract from "tesseract.js";
import * as cheerio from "cheerio";
import qs from "qs";

// Hàm trích xuất hidden fields và các trường cần thiết
async function getFormFields(instance, url) {
  const res = await instance.get(url);
  const $ = cheerio.load(res.data);
  return {
    __VIEWSTATE: $("input[name='__VIEWSTATE']").val(),
    __VIEWSTATEGENERATOR: $("input[name='__VIEWSTATEGENERATOR']").val(),
    __EVENTVALIDATION: $("input[name='__EVENTVALIDATION']").val()
  };
}

// Hàm nhận diện captcha
async function getCaptchaText(instance, url) {
  const res = await instance.get(url, { responseType: "arraybuffer" });
  const { data: { text } } = await Tesseract.recognize(res.data, "eng");
  // Xử lý mã captcha về dạng chỉ chữ số, chữ cái in hoa (nếu cần)
  return text.replace(/[^a-zA-Z0-9]/g, "").trim();
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
      hanHieuLucGCN: $("#txtHanKDToi").text().trim()
    },
    nopPhi: {
      ngayNopPhi: $("#txtNgayNop").text().trim(),
      donViThuPhi: $("#txtDonVi").text().trim(),
      soBienLai: $("#txtBL_ID").text().trim(),
      phiNopDenHetNgay: $("#txtDenNgay").text().trim()
    }
  };
}

// Hàm chính: lookupVRWithRetry
export async function lookupVRWithRetry({ bienSo, soTem }, maxRetry = 5) {
  if (!bienSo || !soTem) {
    return { error: "Bạn phải nhập đủ cả biển số và số tem!" };
  }

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
        txtBienDK: bienSo,
        TxtSoTem: soTem,
        txtCaptcha: captcha,
        CmdTraCuu: "Tra cứu"
      };

      // 4. Gửi POST
      const res = await instance.post(
        FORM_URL,
        qs.stringify(formData),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": FORM_URL
          }
        }
      );

      // 5. Xử lý kết quả
      const info = extractVRInfo(res.data);
      if (info.error && /mã xác thực|captcha/i.test(info.error)) {
        lastError = info.error;
        continue; // thử lại
      }
      return info;
    } catch (err) {
      lastError = err.message;
    }
  }
  return { error: lastError || "Không thể vượt captcha hoặc tra cứu sau nhiều lần thử." };
}
