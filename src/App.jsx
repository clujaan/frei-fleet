import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { LangProvider } from './i18n'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import ModulePage from './pages/ModulePage'
import Deconturi from './pages/Deconturi'
import DecontEditor from './pages/DecontEditor'
import Cheltuieli from './pages/Cheltuieli'
import EntityPage from './pages/EntityPage'
import Burse from './pages/Burse'
import Jurnal from './pages/Jurnal'
import Setari from './pages/Setari'
import Utilizatori from './pages/Utilizatori'
import ExportDate from './pages/ExportDate'
import Comenzi from './pages/Comenzi'
import ComandaClient from './pages/ComandaClient'
import Curse from './pages/Curse'
import Flota from './pages/Flota'
import CosturiFlota from './pages/CosturiFlota'
import Profit from './pages/Profit'
import ToolTrucks from './pages/ToolTrucks'
import ToolEstimator from './pages/ToolEstimator'
import ToolMargin from './pages/ToolMargin'
import ToolFx from './pages/ToolFx'
import ToolTolls from './pages/ToolTolls'
import Leaduri from './pages/Leaduri'
import Interactiuni from './pages/Interactiuni'
import { CARRIERS, CLIENTS, PLACES } from './lib/entities'

function Protected({ children }) {
  const { user, loading, hasAccess, signOut } = useAuth()
  if (loading) {
    return <div className="grid h-full place-items-center bg-navy-950 text-slate-400">…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  if (!hasAccess) {
    return (
      <div className="grid h-full place-items-center bg-navy-950 px-4 text-center text-slate-300">
        <div>
          <p className="text-[15px]">Contul acesta nu are acces la aplicație.</p>
          <p className="mt-1 text-[13px] text-slate-400">This account has no access to the application.</p>
          <button type="button" onClick={signOut} className="mt-4 rounded-lg border border-white/20 px-4 py-2 text-[13px] hover:bg-white/10">Ieșire / Sign out</button>
        </div>
      </div>
    )
  }
  return children
}

// ruta -> cheia modulului (nav.* și MODULES.*)
const MODULE_ROUTES = [
  ['facturi', 'invoices'],
]

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route index element={<Dashboard />} />
              {MODULE_ROUTES.map(([path, key]) => (
                <Route key={path} path={path} element={<ModulePage moduleKey={key} />} />
              ))}
              <Route path="lead-uri" element={<Leaduri />} />
              <Route path="interactiuni" element={<Interactiuni />} />
              <Route path="clienti" element={<EntityPage cfg={CLIENTS} />} />
              <Route path="adrese" element={<EntityPage cfg={PLACES} />} />
              <Route path="transportatori" element={<EntityPage cfg={CARRIERS} />} />
              <Route path="oferte" element={<Burse />} />
              <Route path="tools/camioane" element={<ToolTrucks />} />
              <Route path="tools/estimator" element={<ToolEstimator />} />
              <Route path="tools/taxe-drum" element={<ToolTolls />} />
              <Route path="tools/marja" element={<ToolMargin />} />
              <Route path="tools/convertor" element={<ToolFx />} />
              <Route path="pl" element={<Profit />} />
              <Route path="curse" element={<Curse />} />
              <Route path="flota" element={<Flota />} />
              <Route path="costuri-flota" element={<CosturiFlota />} />
              <Route path="comenzi" element={<Comenzi />} />
              <Route path="comanda-client" element={<ComandaClient />} />
              <Route path="setari" element={<Setari />} />
              <Route path="utilizatori" element={<Utilizatori />} />
              <Route path="jurnal" element={<Jurnal />} />
              <Route path="export" element={<ExportDate />} />
              <Route path="cheltuieli" element={<Cheltuieli />} />
              <Route path="deconturi" element={<Deconturi />} />
              <Route path="deconturi/:id" element={<DecontEditor />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LangProvider>
  )
}
