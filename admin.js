(() => {
  const byId = (id) => document.getElementById(id);
  const siteBase = new URL(".", document.baseURI);
  const state = { artworks: [], csrfToken: null, previewUrls: [] };

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function resolveImageUrl(value) {
    if (!value) return "";
    const source = String(value);
    if (/^(?:data:|blob:|https?:\/\/)/i.test(source)) return source;
    // Comprende i percorsi salvati prima come /uploads/... e /staging/uploads/...
    const uploadMatch = source.match(/(?:^|\/)uploads\/([a-f0-9]{32}\.(?:jpg|png|gif|webp))(?:[?#].*)?$/i);
    if (uploadMatch) return new URL(`uploads/${uploadMatch[1]}`, siteBase).href;
    return new URL(source.replace(/^\/+/, ""), siteBase).href;
  }

  async function api(url, options = {}) {
    const response = await fetch(new URL(`api.php${url}`, siteBase), { credentials: "same-origin", ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Errore server (${response.status}).`);
    return payload;
  }

  function showNotice(target, message, success = false) {
    const node = byId(target);
    node.textContent = message;
    node.classList.toggle("success", success);
  }

  function setAuthenticated(authenticated) {
    byId("loginView").hidden = authenticated;
    byId("adminView").hidden = !authenticated;
    byId("logoutBtn").hidden = !authenticated;
  }

  function setImagePreview(container, src, alt) {
    container.replaceChildren();
    container.hidden = !src;
    if (!src) return;
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.addEventListener("error", () => {
      const message = document.createElement("div");
      message.className = "preview-error";
      message.textContent = "Impossibile visualizzare l’anteprima: immagine non disponibile.";
      container.replaceChildren(message);
      showNotice("pageNotice", "Una delle immagini non è raggiungibile sul server.");
    }, { once: true });
    container.append(image);
  }

  function clearPreviewUrls() {
    state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    state.previewUrls = [];
  }

  async function loadArtworks() {
    const result = await api("?action=artworks");
    state.artworks = Array.isArray(result.artworks) ? result.artworks : [];
    state.artworks.sort((a, b) => (a.title || "").localeCompare(b.title || "", "it"));
    renderList();
  }

  function renderList() {
    const list = byId("artworkList");
    if (!state.artworks.length) {
      list.innerHTML = '<div class="empty">Non ci sono ancora opere. Usa “Nuova opera” per aggiungere la prima.</div>';
      return;
    }
    list.innerHTML = state.artworks.map((artwork) => `
      <article class="admin-row">
        <img src="${escapeHtml(resolveImageUrl(artwork.image || "assets/demo-artwork.jpg"))}" alt="">
        <div><h3>${escapeHtml(artwork.title)}${artwork.isCover ? '<span class="cover-badge">Copertina</span>' : ""}</h3><p>${escapeHtml(artwork.support || "")} · ${escapeHtml(artwork.year || "")}</p></div>
        <button class="btn" type="button" data-edit="${escapeHtml(artwork.id)}">Modifica</button>
      </article>`).join("");
    list.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => {
      image.alt = "Immagine non disponibile";
      image.insertAdjacentText("afterend", "Immagine non disponibile");
      showNotice("pageNotice", "Una o più immagini non sono raggiungibili sul server.");
    }, { once: true }));
    list.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEditor(button.dataset.edit)));
  }

  function openEditor(id = "") {
    const artwork = state.artworks.find((item) => item.id === id);
    byId("artworkForm").reset();
    clearPreviewUrls();
    byId("artId").value = artwork?.id || "";
    byId("editorTitle").textContent = artwork ? "Modifica opera" : "Nuova opera";
    byId("deleteBtn").hidden = !artwork;
    byId("title").value = artwork?.title || "";
    byId("support").value = artwork?.support || "Tela";
    byId("technique").value = artwork?.technique || "";
    byId("dimensions").value = artwork?.dimensions || "";
    byId("status").value = artwork?.status || "Disponibile";
    byId("year").value = artwork?.year || new Date().getFullYear();
    byId("description").value = artwork?.description || "";
    byId("isCover").checked = Boolean(artwork?.isCover);
    byId("reviewer").value = artwork?.reviews?.[0]?.name || "";
    byId("reviewText").value = artwork?.reviews?.[0]?.text || "";
    byId("currentMainImage").textContent = artwork?.image ? "Immagine principale attualmente salvata. Seleziona un file per sostituirla." : "";
    setImagePreview(byId("mainImagePreview"), artwork?.image ? resolveImageUrl(artwork.image) : "", "Immagine principale attuale");
    const extras = artwork?.extras || [];
    byId("extraImagesWrap").hidden = extras.length === 0;
    byId("existingImages").innerHTML = extras.map((src, index) => `<div class="existing-image"><img src="${escapeHtml(resolveImageUrl(src))}" alt="Fotografia aggiuntiva ${index + 1}"><label><input type="checkbox" data-keep-extra="${index}" checked> Mantieni</label></div>`).join("");
    byId("existingImages").querySelectorAll("img").forEach((image) => image.addEventListener("error", () => {
      image.alt = "Immagine non disponibile";
      image.insertAdjacentText("afterend", "Immagine non disponibile");
      showNotice("pageNotice", "Una o più immagini non sono raggiungibili sul server.");
    }, { once: true }));
    byId("newExtraPreviews").replaceChildren();
    byId("editor").hidden = false;
    byId("editor").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  byId("mainImage").addEventListener("change", () => {
    const file = byId("mainImage").files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    state.previewUrls.push(url);
    setImagePreview(byId("mainImagePreview"), url, `Anteprima di ${file.name}`);
  });

  byId("extraImages").addEventListener("change", () => {
    byId("newExtraPreviews").replaceChildren();
    for (const file of byId("extraImages").files) {
      const url = URL.createObjectURL(file);
      state.previewUrls.push(url);
      const preview = document.createElement("div");
      preview.className = "existing-image";
      const image = document.createElement("img");
      image.src = url;
      image.alt = `Anteprima di ${file.name}`;
      const label = document.createElement("span");
      label.textContent = file.name;
      image.addEventListener("error", () => {
        preview.replaceChildren(Object.assign(document.createElement("span"), { className: "preview-error", textContent: `Anteprima non disponibile: ${file.name}` }));
        showNotice("pageNotice", `Impossibile visualizzare l’anteprima di ${file.name}.`);
      }, { once: true });
      preview.append(image, label);
      byId("newExtraPreviews").append(preview);
    }
  });

  async function submitArtwork(event) {
    event.preventDefault();
    const id = byId("artId").value;
    const previous = state.artworks.find((item) => item.id === id);
    const keptExtras = (previous?.extras || []).filter((_, index) => byId("existingImages").querySelector(`[data-keep-extra="${index}"]`)?.checked);
    const reviews = [...(previous?.reviews || [])];
    if (byId("reviewer").value.trim() || byId("reviewText").value.trim() || reviews[0]) {
      reviews[0] = { ...(reviews[0] || {}), name: byId("reviewer").value.trim(), text: byId("reviewText").value.trim() };
    }
    const artwork = {
      ...(previous || {}), id: id || `art-${Date.now()}`,
      title: byId("title").value.trim(), support: byId("support").value,
      technique: byId("technique").value.trim(), dimensions: byId("dimensions").value.trim(),
      status: byId("status").value, year: byId("year").value.trim(),
      description: byId("description").value.trim(), extras: keptExtras, reviews,
      isCover: byId("isCover").checked
    };
    const formData = new FormData();
    formData.append("action", "save");
    formData.append("artwork", JSON.stringify(artwork));
    for (const file of byId("extraImages").files) formData.append("extraImages[]", file);
    if (byId("mainImage").files[0]) formData.append("mainImage", byId("mainImage").files[0]);
    if (byId("reviewPhoto").files[0]) formData.append("reviewPhoto", byId("reviewPhoto").files[0]);
    byId("saveBtn").disabled = true;
    showNotice("pageNotice", "Salvataggio in corso…");
    try {
      await api("", { method: "POST", headers: { "X-CSRF-Token": state.csrfToken }, body: formData });
      byId("editor").hidden = true;
      clearPreviewUrls();
      showNotice("pageNotice", "Opera salvata.", true);
      await loadArtworks();
    } catch (error) {
      showNotice("pageNotice", error.message);
    } finally {
      byId("saveBtn").disabled = false;
    }
  }

  async function deleteArtwork() {
    const id = byId("artId").value;
    const artwork = state.artworks.find((item) => item.id === id);
    if (!id || !confirm(`Eliminare “${artwork?.title || "questa opera"}”? I file immagine sul server saranno conservati.`)) return;
    try {
      await api("", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": state.csrfToken }, body: JSON.stringify({ action: "delete", id }) });
      byId("editor").hidden = true;
      clearPreviewUrls();
      showNotice("pageNotice", "Opera eliminata. I file immagine sono stati conservati.", true);
      await loadArtworks();
    } catch (error) {
      showNotice("pageNotice", error.message);
    }
  }

  byId("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    showNotice("loginNotice", "Verifica accesso…");
    try {
      const result = await api("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", password: byId("password").value }) });
      state.csrfToken = result.csrfToken;
      setAuthenticated(true);
      showNotice("pageNotice", "Accesso effettuato.", true);
      await loadArtworks();
    } catch (error) {
      showNotice("loginNotice", error.message);
    }
  });

  byId("logoutBtn").addEventListener("click", async () => {
    try {
      await api("", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": state.csrfToken }, body: JSON.stringify({ action: "logout" }) });
    } catch (error) {
      showNotice("pageNotice", error.message);
    } finally {
      state.csrfToken = null;
      setAuthenticated(false);
    }
  });
  byId("newArtworkBtn").addEventListener("click", () => openEditor());
  byId("cancelBtn").addEventListener("click", () => { byId("editor").hidden = true; clearPreviewUrls(); });
  byId("artworkForm").addEventListener("submit", submitArtwork);
  byId("deleteBtn").addEventListener("click", deleteArtwork);

  api("?action=auth").then(async (result) => {
    setAuthenticated(Boolean(result.authenticated));
    state.csrfToken = result.csrfToken;
    if (result.authenticated) await loadArtworks();
  }).catch((error) => {
    setAuthenticated(false);
    showNotice("loginNotice", `Servizio non disponibile: ${error.message}`);
  });
})();
