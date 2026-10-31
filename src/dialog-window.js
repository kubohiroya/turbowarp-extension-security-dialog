// Window gestures do not modify execution choices or complete the security review.
export function attachSecurityDialogWindow(anchor, labels) {
  const dialog = anchor.closest('[role="dialog"]');
  const titlebar = dialog?.querySelector('.twextsec-frame-header');
  if (!dialog || !titlebar || !titlebar.parentElement.contains(anchor)) return null;
  const doc = dialog.ownerDocument, win = doc.defaultView;
  if (!win) return null;
  const frame = titlebar.parentElement;
  const maximizeButton = doc.createElement('button');
  maximizeButton.type = 'button';
  maximizeButton.className = 'twextsec-window-button';
  titlebar.append(maximizeButton);
  let gesture = null, restoreBounds = null;
  const handles = [];
  let currentLabels = labels;
  const originalStyle = dialog.style.cssText;
  dialog.setAttribute('data-twextsec-window', '');
  if (frame !== dialog) frame.setAttribute('data-twextsec-window-frame', '');

  const viewport = () => ({width: win.innerWidth, height: win.innerHeight});
  const bounds = () => {
    const {x, y, width, height} = dialog.getBoundingClientRect();
    return {x, y, width, height};
  };
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  function fit(rect) {
    const view = viewport();
    const width = clamp(rect.width, Math.min(360, view.width), view.width);
    const height = clamp(rect.height, Math.min(280, view.height), view.height);
    return {width, height, x: clamp(rect.x, 0, view.width - width), y: clamp(rect.y, 0, view.height - height)};
  }
  function place(rect) {
    Object.assign(dialog.style, {maxHeight: "100dvh", transform: "none",
      margin: "0", inset: "auto", left: `${rect.x}px`, top: `${rect.y}px`,
      width: `${rect.width}px`, height: `${rect.height}px`,
    });
  }
  function stop(event) {
    if (!gesture || (event?.pointerId !== undefined && event.pointerId !== gesture.id)) return;
    const {target, id} = gesture;
    gesture = null;
    if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
    dialog.removeAttribute('data-twextsec-dragging');
  }
  function start(event, edge) {
    if (restoreBounds || gesture || event.button !== 0 || !event.isPrimary) return;
    if (!edge && event.target.closest("button, a, input, select, textarea")) return;
    event.preventDefault();
    const target = event.currentTarget;
    gesture = {id: event.pointerId, target, edge, x: event.clientX, y: event.clientY, rect: fit(bounds())};
    place(gesture.rect);
    target.setPointerCapture(event.pointerId);
    dialog.setAttribute('data-twextsec-dragging', '');
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const {rect, edge} = gesture, view = viewport();
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!edge) {
      place(fit({...rect, x: rect.x + dx, y: rect.y + dy}));
      return;
    }
    const minWidth = Math.min(360, view.width), minHeight = Math.min(280, view.height);
    let left = rect.x, top = rect.y, right = rect.x + rect.width, bottom = rect.y + rect.height;
    if (edge.includes("w")) left = clamp(rect.x + dx, 0, right - minWidth);
    if (edge.includes("e")) right = clamp(right + dx, left + minWidth, view.width);
    if (edge.includes("n")) top = clamp(rect.y + dy, 0, bottom - minHeight);
    if (edge.includes("s")) bottom = clamp(bottom + dy, top + minHeight, view.height);
    place({x: left, y: top, width: right - left, height: bottom - top});
  }
  const startMove = event => start(event, "");
  titlebar.addEventListener("pointerdown", startMove);
  for (const edge of ["n", "e", "s", "w", "ne", "se", "sw", "nw"]) {
    const handle = doc.createElement("div");
    handle.className = "twextsec-resize";
    handle.dataset.edge = edge;
    handle.setAttribute("aria-hidden", "true");
    handle.addEventListener("pointerdown", event => start(event, edge));
    dialog.append(handle);
    handles.push(handle);
  }
  function updateButton() {
    const label = restoreBounds ? currentLabels.restore : currentLabels.maximize;
    maximizeButton.setAttribute("aria-label", label);
    maximizeButton.setAttribute("aria-pressed", String(Boolean(restoreBounds)));
    maximizeButton.title = label;
    maximizeButton.textContent = restoreBounds ? "❐" : "⛶";
    dialog.toggleAttribute('data-twextsec-maximized', Boolean(restoreBounds));
  }
  function toggle() {
    stop();
    if (restoreBounds) {
      place(fit(restoreBounds));
      restoreBounds = null;
    } else {
      restoreBounds = bounds();
      place({x: 0, y: 0, ...viewport()});
    }
    updateButton();
  }
  function resize() {
    stop();
    if (restoreBounds) place({x: 0, y: 0, ...viewport()});
    else place(fit(bounds()));
  }
  maximizeButton.addEventListener("click", toggle);
  win.addEventListener("pointermove", move);
  win.addEventListener("pointerup", stop);
  win.addEventListener("pointercancel", stop);
  win.addEventListener("blur", stop);
  win.addEventListener("resize", resize);
  dialog.addEventListener("lostpointercapture", stop);
  dialog.addEventListener("close", stop);
  updateButton();
  return {
    updateLabels(next) { currentLabels = next; updateButton(); },
    dispose() {
      stop();
      titlebar.removeEventListener("pointerdown", startMove);
      maximizeButton.removeEventListener("click", toggle);
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", stop);
      win.removeEventListener("pointercancel", stop);
      win.removeEventListener("blur", stop);
      win.removeEventListener("resize", resize);
      dialog.removeEventListener("lostpointercapture", stop);
      dialog.removeEventListener("close", stop);
      handles.forEach(handle => handle.remove());
      maximizeButton.remove();
      dialog.style.cssText = originalStyle;
      dialog.removeAttribute('data-twextsec-window');
      dialog.removeAttribute('data-twextsec-maximized');
      if (frame !== dialog) frame.removeAttribute('data-twextsec-window-frame');
    },
  };
}
