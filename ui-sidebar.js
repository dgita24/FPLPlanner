// ui-sidebar.js - Sidebar toggle and related UI actions

let sidebarJustToggled = false;

export function toggleSidebarMenu() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.classList.toggle('open');
  // Prevent immediate outside-click handler from closing the sidebar right after toggle
  sidebarJustToggled = true;
  setTimeout(() => (sidebarJustToggled = false), 300);
}

export function closeSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.classList.remove('open');
  sidebarJustToggled = false;
}

export function toggleHelpModal() {
  const modal = document.getElementById('helpModal');
  if (!modal) return;
  modal.classList.toggle('open');
}

export function closeHelpModal() {
  const modal = document.getElementById('helpModal');
  if (!modal) return;
  modal.classList.remove('open');
}

export function setupSidebarHandlers() {
  // Close sidebar when clicking outside it (but avoid immediately closing right after toggle)
  document.addEventListener('click', (e) => {
    if (sidebarJustToggled) return;
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    if (!sb.classList.contains('open')) return;
    // If click is outside the sidebar, close it
    if (!e.target.closest('#sidebar')) {
      closeSidebar();
    }
  });

  // Close sidebar on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSidebar();
      closeHelpModal();
    }
  });

  // Close help modal when clicking outside the content
  document.addEventListener('click', (e) => {
    const modal = document.getElementById('helpModal');
    if (!modal) return;
    if (modal.classList.contains('open') && e.target === modal) {
      closeHelpModal();
    }
  });
}
