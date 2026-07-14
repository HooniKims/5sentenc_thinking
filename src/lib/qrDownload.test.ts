import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadQrPng } from "./qrDownload";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("QR 이미지 내려받기", () => {
  it("QR 캔버스를 PNG 파일로 내려받는다", () => {
    const canvas = document.createElement("canvas");
    const append = vi.spyOn(document.body, "append");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.spyOn(canvas, "toDataURL").mockReturnValue("data:image/png;base64,qr-image");

    downloadQrPng(canvas, "5문장-길찾기-학생-참여-QR.png");

    const downloadedLink = append.mock.calls[0]?.[0];
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/png");
    expect(downloadedLink).toBeInstanceOf(HTMLAnchorElement);
    expect(click).toHaveBeenCalledTimes(1);
    if (downloadedLink instanceof HTMLAnchorElement) {
      expect(downloadedLink.download).toBe("5문장-길찾기-학생-참여-QR.png");
      expect(downloadedLink.href).toBe("data:image/png;base64,qr-image");
    }
  });
});
