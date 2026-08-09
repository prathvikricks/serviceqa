import { useEffect, useState } from 'react'

/** Persisted sidebar collapsed state (icon rail vs full width). */
export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem('sidebarCollapsed') === '1',
  )

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0')
  }, [collapsed])

  return { collapsed, toggle: () => setCollapsed((c) => !c) }
}
