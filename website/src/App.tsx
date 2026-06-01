import './index.css'
import TopNav from './sections/TopNav'
import Hero from './sections/Hero'
import ScenarioShowcase from './sections/ScenarioShowcase'
import CoreArchitecture from './sections/CoreArchitecture'
import Downloads from './sections/Downloads'
import Features from './sections/Features'
import HowItWorks from './sections/HowItWorks'
import Comparison from './sections/Comparison'
import DesktopApp from './sections/DesktopApp'
import MobileApp from './sections/MobileApp'
import QuickStart from './sections/QuickStart'
import Footer from './sections/Footer'

function App() {
  return (
    <div className="min-h-screen">
      <TopNav />
      <Hero />
      <ScenarioShowcase />
      <Features />
      <CoreArchitecture />
      <Downloads />
      <HowItWorks />
      <Comparison />
      <DesktopApp />
      <MobileApp />
      <QuickStart />
      <Footer />
    </div>
  )
}

export default App
