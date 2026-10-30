(() => {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebarToggle");
  const overlay = document.getElementById("mobileOverlay");
  const pageTitle = document.getElementById("pageTitle");

  const titles = {
    dashboard: "Dashboard",
    movements: "Movimenti",
    budgets: "Budget mensili",
    statistics: "Statistiche",
    savings: "Risparmio",
    categories: "Categorie",
    settings: "Impostazioni"
  };

  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
  }

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("open");
  }

  function showSection(name) {
    if (!titles[name]) return;

    document.querySelectorAll(".app-section").forEach(section => {
      section.classList.remove("active");
    });

    document.querySelectorAll(".nav-link").forEach(button => {
      button.classList.remove("active");
    });

    const section = document.getElementById("section-" + name);
    const button = document.querySelector(
      `.nav-link[data-section="${name}"]`
    );

    if (section) section.classList.add("active");
    if (button) button.classList.add("active");

    pageTitle.textContent = titles[name];

    closeSidebar();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

    setTimeout(() => {
      if (window.Chart) {
        Object.values(Chart.instances).forEach(chart => {
          chart.resize();
        });
      }
    }, 100);
  }

  document.querySelectorAll(".nav-link").forEach(button => {
    button.addEventListener("click", () => {
      showSection(button.dataset.section);
    });
  });

  toggle.addEventListener("click", () => {
    if (sidebar.classList.contains("open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  overlay.addEventListener("click", closeSidebar);

  window.addEventListener("resize", () => {
    if (window.innerWidth > 850) {
      closeSidebar();
    }
  });

  window.showSection = showSection;
})();
