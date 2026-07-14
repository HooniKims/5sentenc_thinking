export function downloadQrPng(canvas: HTMLCanvasElement, fileName: string): void {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = canvas.toDataURL("image/png");
  document.body.append(link);
  link.click();
  link.remove();
}
