import React from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import PdfViewer from './components/PdfViewer'
import LicenseManager from './components/LicenseManager'
import ProjectDetailsScreen from './components/ProjectDetailsScreen'
import ProjectListScreen from './components/ProjectListScreen'
import BoQTab from './components/BoQTab'
import CertificatesTab from './components/CertificatesTab'
import FeasibilityTab from './components/FeasibilityTab'
import PaidLoginGate from './components/PaidLoginGate'
import { useStore } from './store'
import { runtimeEntitlementsFromLicenseStatus } from './utils/licensePackages'

function packageDisplayName(status) {
  if (status?.type === 'trial') return 'Trial (Full Package)'
  const code = (status?.packageCode || 'DMD').toUpperCase()
  if (code === 'QTZ') return 'Quartz'
  if (code === 'TPZ') return 'Topaz'
  if (code === 'EMD') return 'Emerald'
  if (code === 'SAP') return 'Sapphire'
  if (code === 'RBY') return 'Ruby'
  return 'Diamond'
}

export default function AppGlobal() {
  const currentProjectId = useStore(s => s.currentProjectId)
  const projects = useStore(s => s.projects)
  const activeTab = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)
  const showProjectList = useStore(s => s.showProjectList)
  const setShowProjectList = useStore(s => s.setShowProjectList)
  const [entitlements, setEntitlements] = React.useState({ measure: true, boq: true, certificates: true, feasibility: true })
  const [currentPackageLabel, setCurrentPackageLabel] = React.useState('Diamond')
  const [authReady, setAuthReady] = React.useState(false)
  const [isAuthenticated, setIsAuthenticated] = React.useState(false)
  const [currentLicenseType, setCurrentLicenseType] = React.useState('trial')
  const currentProjectBoqDisabled = !!(currentProjectId && projects[currentProjectId]?.boqType === 'none')

  React.useEffect(() => {
    const syncFromElectron = async () => {
      if (!window.electronAPI?.getLicenseStatus) return
      const s = await window.electronAPI.getLicenseStatus()
      setEntitlements(runtimeEntitlementsFromLicenseStatus(s))
      setCurrentPackageLabel(packageDisplayName(s))
      setCurrentLicenseType(s?.type === 'subscription' ? 'subscription' : 'trial')
      if (window.electronAPI?.getAppAuthState) {
        const auth = await window.electronAPI.getAppAuthState()
        setIsAuthenticated(!!auth?.isAuthenticated)
      } else {
        setIsAuthenticated(false)
      }
      setAuthReady(true)
    }
    syncFromElectron()
    const onStatus = () => { syncFromElectron() }
    window.addEventListener('license-status-changed', onStatus)
    return () => window.removeEventListener('license-status-changed', onStatus)
  }, [])

  React.useEffect(() => {
    if (activeTab === 'boq' && (!entitlements.boq || currentProjectBoqDisabled)) setActiveTab('measure')
    if (activeTab === 'certificates' && !entitlements.certificates) setActiveTab('measure')
    if (activeTab === 'feasibility' && !entitlements.feasibility) setActiveTab('measure')
  }, [activeTab, entitlements, currentProjectBoqDisabled, setActiveTab])

  const hasProjects = Object.keys(projects || {}).length > 0
  const showProjectDetailsForm = useStore(s => s.showProjectDetailsForm)
  const setShowProjectDetailsForm = useStore(s => s.setShowProjectDetailsForm)
  const setEditingProjectId = useStore(s => s.setEditingProjectId)
  const showProjectDetails = (!currentProjectId && !hasProjects) || showProjectDetailsForm

  if (showProjectList && hasProjects) {
    return (
      <>
        <ProjectListScreen />
        <LicenseManager />
        {authReady && (
          <PaidLoginGate
            visible={!isAuthenticated}
            licenseType={currentLicenseType}
            onAuthenticated={() => setIsAuthenticated(true)}
          />
        )}
      </>
    )
  }

  if (showProjectDetails) {
    return (
      <>
        <ProjectDetailsScreen />
        <LicenseManager />
        {authReady && (
          <PaidLoginGate
            visible={!isAuthenticated}
            licenseType={currentLicenseType}
            onAuthenticated={() => setIsAuthenticated(true)}
          />
        )}
      </>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: 'sans-serif',
      margin: 0,
      padding: 0
    }}>
      <Header />
      {/* Tab bar: Measure + B of Q left; Projects + New project right (Windows-style buttons) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        background: '#f0f0f0',
        borderBottom: '1px solid #ccc',
        padding: '8px 16px',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            className="btn-app"
            onClick={() => setActiveTab('measure')}
            style={{
              padding: '10px 18px',
              borderBottom: activeTab === 'measure' ? '2px solid #1a73e8' : '2px solid transparent',
              marginBottom: activeTab === 'measure' ? -9 : -9,
              background: activeTab === 'measure' ? '#e8f5e9' : undefined,
            }}
          >
            Measure
          </button>
          <button
            type="button"
            className="btn-app"
            onClick={() => entitlements.boq && !currentProjectBoqDisabled && setActiveTab('boq')}
            disabled={!entitlements.boq || currentProjectBoqDisabled}
            title={!entitlements.boq ? 'Not included in your package' : currentProjectBoqDisabled ? 'This project has no Bills of Quantities' : 'B of Q'}
            style={{
              padding: '10px 18px',
              borderBottom: activeTab === 'boq' ? '2px solid #1a73e8' : '2px solid transparent',
              marginBottom: activeTab === 'boq' ? -9 : -9,
              background: activeTab === 'boq' ? '#e8f5e9' : undefined,
            }}
          >
            B of Q
          </button>
          <button
            type="button"
            className="btn-app"
            onClick={() => entitlements.certificates && setActiveTab('certificates')}
            disabled={!entitlements.certificates}
            title={!entitlements.certificates ? 'Not included in your package' : 'Certificates'}
            style={{
              padding: '10px 18px',
              borderBottom: activeTab === 'certificates' ? '2px solid #1a73e8' : '2px solid transparent',
              marginBottom: activeTab === 'certificates' ? -9 : -9,
              background: activeTab === 'certificates' ? '#e8f5e9' : undefined,
            }}
          >
            Certificates
          </button>
          <button
            type="button"
            className="btn-app"
            onClick={() => entitlements.feasibility && setActiveTab('feasibility')}
            disabled={!entitlements.feasibility}
            title={!entitlements.feasibility ? 'Not included in your package' : 'Estimates & Feasibility'}
            style={{
              padding: '10px 18px',
              borderBottom: activeTab === 'feasibility' ? '2px solid #1a73e8' : '2px solid transparent',
              marginBottom: activeTab === 'feasibility' ? -9 : -9,
              background: activeTab === 'feasibility' ? '#e8f5e9' : undefined,
            }}
          >
            Estimates & Feasibility
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 12px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: '100%', minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentProjectId && projects[currentProjectId] ? (projects[currentProjectId].name || 'Untitled project') : 'No project selected'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>
              Current Package: {currentPackageLabel}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasProjects && (
            <button
              type="button"
              className="btn-app"
              onClick={() => setShowProjectList(true)}
            >
              Projects
            </button>
          )}
          <button
            type="button"
            className="btn-app"
            onClick={() => { setEditingProjectId(null); setShowProjectDetailsForm(true) }}
          >
            New project
          </button>
        </div>
      </div>

      {/* Measure tab: mount only when active so PdfViewer always has proper layout and drawing visible.
          B of Q tab: always mounted but hidden when on Measure so quantities/rows are never lost. */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        {activeTab === 'measure' && (
          <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 120px - 48px)', overflow: 'hidden', flexDirection: 'row' }}>
            <div
              className="sidebarRoot"
              style={{
                width: '320px',
                borderRight: '2px solid #3B7A57',
                background: '#FDF6E3',
                overflowY: 'auto',
                height: '100%',
                fontSize: '13px',
                color: '#2F3E46',
                position: 'relative',
                zIndex: 1000,
                pointerEvents: 'auto'
              }}
              onMouseEnter={() => window.dispatchEvent(new CustomEvent('sidebar-mouseenter'))}
              onMouseLeave={() => window.dispatchEvent(new CustomEvent('sidebar-mouseleave'))}
            >
              <Sidebar />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              {currentProjectId && <Toolbar />}
              <div
                className="viewerRoot"
                style={{
                  flex: 1,
                  position: 'relative',
                  background: '#fff',
                  height: currentProjectId ? 'calc(100% - 60px)' : '100%',
                  minHeight: '500px',
                  overflow: 'hidden',
                  zIndex: 1
                }}
              >
                {currentProjectId ? (
                  <PdfViewer />
                ) : (
                  <div style={{ padding: 32 }}>
                    <h1 style={{ marginBottom: 16, color: '#3B7A57' }}>Measure</h1>
                    <p style={{ fontSize: '15px', color: '#2F3E46' }}>
                      Load a drawing from the sidebar, set the scale, then measure lengths, areas or counts. 
                      Switch to the <strong>B of Q</strong> tab to link quantities to your Bills of Quantities.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div
          style={{
            display: activeTab === 'boq' ? 'flex' : 'none',
            flex: 1,
            overflow: 'hidden',
            flexDirection: 'column',
          }}
        >
          <BoQTab />
        </div>
        <div
          style={{
            display: activeTab === 'certificates' ? 'flex' : 'none',
            flex: 1,
            overflow: 'hidden',
            flexDirection: 'column',
          }}
        >
          <CertificatesTab />
        </div>
        <div
          style={{
            display: activeTab === 'feasibility' ? 'flex' : 'none',
            flex: 1,
            overflow: 'hidden',
            flexDirection: 'column',
          }}
        >
          <FeasibilityTab />
        </div>
      </div>

      <LicenseManager />
      {authReady && (
        <PaidLoginGate
          visible={!isAuthenticated}
          licenseType={currentLicenseType}
          onAuthenticated={() => setIsAuthenticated(true)}
        />
      )}
    </div>
  )
}
