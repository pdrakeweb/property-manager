import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppShell } from './components/layout/AppShell'
import { DashboardScreen }      from './screens/DashboardScreen'
import { CaptureSelectScreen }  from './screens/CaptureSelectScreen'
import { EquipmentFormScreen }  from './screens/EquipmentFormScreen'
import { MaintenanceScreen }    from './screens/MaintenanceScreen'
import { BudgetScreen }         from './screens/BudgetScreen'
import { AIAdvisoryScreen }     from './screens/AIAdvisoryScreen'
import { InventoryScreen }      from './screens/InventoryScreen'
import { SettingsScreen }       from './screens/SettingsScreen'

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path="/"                    element={<ErrorBoundary fallbackTitle="Dashboard error"><DashboardScreen /></ErrorBoundary>}     />
            <Route path="/capture"             element={<ErrorBoundary fallbackTitle="Capture error"><CaptureSelectScreen /></ErrorBoundary>} />
            <Route path="/capture/:categoryId" element={<ErrorBoundary fallbackTitle="Form error"><EquipmentFormScreen /></ErrorBoundary>} />
            <Route path="/maintenance"         element={<ErrorBoundary fallbackTitle="Maintenance error"><MaintenanceScreen /></ErrorBoundary>}   />
            <Route path="/budget"              element={<ErrorBoundary fallbackTitle="Budget error"><BudgetScreen /></ErrorBoundary>}        />
            <Route path="/advisor"             element={<ErrorBoundary fallbackTitle="Advisor error"><AIAdvisoryScreen /></ErrorBoundary>}    />
            <Route path="/inventory"           element={<ErrorBoundary fallbackTitle="Inventory error"><InventoryScreen /></ErrorBoundary>}     />
            <Route path="/settings"            element={<ErrorBoundary fallbackTitle="Settings error"><SettingsScreen /></ErrorBoundary>}      />
            <Route path="*"                    element={<Navigate to="/" />}     />
          </Routes>
        </AppShell>
      </HashRouter>
    </ErrorBoundary>
  )
}
