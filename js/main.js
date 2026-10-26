// Interacciones visuales compartidas
document.addEventListener("DOMContentLoaded", () => {
  const menuButton = document.querySelector(".menu-toggle");
  const mainNav = document.querySelector(".main-nav");
  menuButton?.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    menuButton.setAttribute(
      "aria-label",
      isOpen ? "Abrir menú" : "Cerrar menú",
    );
    mainNav?.classList.toggle("is-open", !isOpen);
  });

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  const animateCount = (element) => {
    const target = Number(element.dataset.count || 0);
    const duration = 1000;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      element.textContent = String(
        Math.round(target * (1 - Math.pow(1 - progress, 3))),
      );
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const counters = document.querySelectorAll("[data-count]");
  if ("IntersectionObserver" in window) {
    const counterObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 },
    );
    counters.forEach((counter) => counterObserver.observe(counter));
  } else counters.forEach(animateCount);

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute(
        "aria-label",
        show ? "Ocultar contraseña" : "Mostrar contraseña",
      );
    });
  });

  const strengthInput = document.querySelector("[data-strength-input]");
  if (strengthInput) {
    const meter = document.querySelector(".strength-meter");
    const label = document.querySelector(".strength-label");
    strengthInput.addEventListener("input", () => {
      const value = strengthInput.value;
      let score = 0;
      if (value.length >= 8) score += 1;
      if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
      if (/\d/.test(value)) score += 1;
      if (/[^A-Za-z0-9]/.test(value)) score += 1;
      meter.dataset.level = String(score);
      label.textContent = !value
        ? "Usa al menos 8 caracteres"
        : ["Muy débil", "Débil", "Aceptable", "Buena", "Fuerte"][score];
    });
  }

  document.querySelectorAll(".demo-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const notice = form.querySelector(".form-notice");
      if (notice)
        notice.textContent =
          "Esto es solo una demostración visual. No se enviaron datos.";
    });
  });

  const photoInput = document.querySelector("[data-photo-input]");
  const photoPreview = document.querySelector("[data-photo-preview]");
  photoInput?.addEventListener("change", () => {
    photoPreview.replaceChildren();
    [...photoInput.files].slice(0, 5).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const image = document.createElement("img");
      image.alt = `Vista previa: ${file.name}`;
      image.src = URL.createObjectURL(file);
      photoPreview.append(image);
    });
  });

  document.querySelectorAll(".condition-option input").forEach((input) => {
    input.addEventListener("change", () => {
      document
        .querySelectorAll(".condition-option")
        .forEach((option) => option.classList.remove("is-selected"));
      input.closest(".condition-option")?.classList.add("is-selected");
    });
  });

  const toast = document.querySelector("[data-toast]");
  let toastTimer;
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  };

  const filterSelects = [...document.querySelectorAll("[data-filter]")];
  const searchInput = document.querySelector("[data-search-input]");
  const filterList = document.querySelector("[data-filter-list]");
  const resultCount = document.querySelector("[data-result-count]");
  const emptyState = document.querySelector("[data-empty-state]");
  const applyFilters = () => {
    if (!filterList) return;
    const cards = [...filterList.children].filter((item) =>
      item.matches("[data-category], [data-district]"),
    );
    let visible = 0;
    cards.forEach((card) => {
      const matchesSelects = filterSelects.every((select) => {
        const key = select.dataset.filter;
        const value = select.value.toLocaleLowerCase();
        const content = (card.dataset[key] || "").toLocaleLowerCase();
        return !value || content.includes(value);
      });
      const query = (searchInput?.value || "").trim().toLocaleLowerCase();
      const matchesSearch =
        !query ||
        (card.dataset.search || card.textContent)
          .toLocaleLowerCase()
          .includes(query);
      const matches = matchesSelects && matchesSearch;
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    if (emptyState) emptyState.hidden = visible !== 0;
    if (resultCount)
      resultCount.textContent = `${visible} ${visible === 1 ? "equipo" : "equipos"}`;
  };
  filterSelects.forEach((select) =>
    select.addEventListener("change", applyFilters),
  );
  searchInput?.addEventListener("input", applyFilters);
  document
    .querySelector("[data-filter-reset]")
    ?.addEventListener("click", () => {
      filterSelects.forEach((select) => {
        select.value = "";
      });
      if (searchInput) searchInput.value = "";
      applyFilters();
    });

  const reportModal = document.querySelector("[data-report-modal]");
  document.querySelectorAll("[data-report-trigger]").forEach((button) => {
    button.addEventListener("click", () => reportModal?.showModal());
  });
  reportModal?.querySelector("form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    reportModal.close();
    showToast("Reporte registrado en esta demostración visual.");
  });
  document.querySelectorAll("[data-contact]").forEach((button) => {
    button.addEventListener("click", () =>
      showToast(
        `La mensajería con ${button.dataset.contact} es una demostración visual.`,
      ),
    );
  });
  document
    .querySelector("[data-send-message]")
    ?.addEventListener("click", () => {
      const input = document.querySelector("[data-message-input]");
      if (input?.value.trim()) {
        showToast("Mensaje de demostración preparado. No se envió.");
        input.value = "";
      } else showToast("Escribe un mensaje para continuar.");
    });
  document
    .querySelector("[data-rating-trigger]")
    ?.addEventListener("click", () =>
      showToast("Las calificaciones son parte de esta demostración visual."),
    );
  document.querySelectorAll("[data-directions]").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showToast("Las direcciones de esta pantalla son referenciales.");
    }),
  );

  document.querySelectorAll("[data-accordion] details").forEach((detail) => {
    detail.addEventListener("toggle", () => {
      if (!detail.open) return;
      document.querySelectorAll("[data-accordion] details").forEach((other) => {
        if (other !== detail) other.open = false;
      });
    });
  });
});
