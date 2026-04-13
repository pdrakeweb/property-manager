import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { useAuth } from './auth/AuthContext'
import { SignInScreen } from './screens/SignInScreen'
import { DashboardScreen }      from './screens/DashboardScreen'
import { CaptureSelectScreen }  from './screens/CaptureSelectScreen'
import { EquipmentFormScreen }  from './screens/EquipmentFormScreen'
import { MaintenanceScreen }    from './screens/MaintenanceScreen'
import { BudgetScreen }         from './screens/BudgetScreen'
import { AIAdvisoryScreen }     from './screens/AIAdvisoryScreen'
import { InventoryScreen }      from './screens/InventoryScreen'
import { SettingsScreen }       from './screens/SettingsScreen'

export default function App() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <SignInScreen />
  }

  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/"                    element={<DashboardScreen />}     />
          <Route path="/capture"             element={<CaptureSelectScreen />} />
          <Route path="/capture/:categoryId" element={<EquipmentFormScreen />} />
          <Route path="/maintenance"         element={<MaintenanceScreen />}   />
          <Route path="/budget"              element={<BudgetScreen />}        />
          <Route path="/advisor"             element={<AIAdvisoryScreen />}    />
          <Route path="/inventory"           element={<InventoryScreen />}     />
          <Route path="/settings"            element={<SettingsScreen />}      />
          <Route path="*"                    element={<Navigate to="/" />}     />
        </Routes>
      </AppShell>
    </HashRouter>
  )
}
