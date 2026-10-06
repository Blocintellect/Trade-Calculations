document.getElementById("downloadBtn").addEventListener("click", async () => {
  const button = document.getElementById("downloadBtn");
  const report = document.getElementById("report");

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Creating PNG…";

  try {
    const canvas = await html2canvas(report, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      width: 794,
      height: 1123,
      windowWidth: 794,
      windowHeight: 1123
    });

    const link = document.createElement("a");
    link.download = "trading-pnl-performance.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (error) {
    console.error(error);
    alert("Could not create the PNG. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});
