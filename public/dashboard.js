const list = document.querySelector("#help-order");
if (list) {
  let dragged = null;
  const status = document.querySelector("#sort-status");
  list.querySelectorAll("li").forEach(item => {
    item.addEventListener("dragstart", () => { dragged = item; item.classList.add("dragging"); });
    item.addEventListener("dragend", () => { item.classList.remove("dragging"); dragged = null; });
    item.addEventListener("dragover", e => {
      e.preventDefault();
      const target = e.currentTarget;
      if (dragged && target !== dragged) {
        const rect = target.getBoundingClientRect();
        list.insertBefore(dragged, e.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
      }
    });
    item.addEventListener("drop", e => e.preventDefault());
  });
  list.addEventListener("dragend", async () => {
    const order = [...list.querySelectorAll("li span:nth-child(2)")].map(x => x.textContent.trim());
    try {
      const res = await fetch(`/dashboard/${list.dataset.guild}/help-order`, {
        method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":list.dataset.csrf},body:JSON.stringify({order})
      });
      status.textContent = res.ok ? "Order saved." : "Could not save order; refresh and try again.";
    } catch { status.textContent = "Network error saving order."; }
  });
}
