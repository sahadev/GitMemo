import './index.css'
import TopNav from './sections/TopNav'
import Hero from './sections/Hero'
import WhyAiEra from './sections/WhyAiEra'
import ScenarioShowcase from './sections/ScenarioShowcase'
import CoreArchitecture from './sections/CoreArchitecture'
import Downloads from './sections/Downloads'
import Features from './sections/Features'
import CapabilityMatrix from './sections/CapabilityMatrix'
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
      <CoreArchitecture />
      <Features />
      <CapabilityMatrix />
      <WhyAiEra />
      <HowItWorks />
      <DesktopApp />
      <MobileApp />
      <Comparison />
      <Downloads />
      <QuickStart />
      <Footer />
      <div className="wechat-float" aria-label="微信交流">
        <img src="/wechat-qr.png" alt="Sahadev WeChat QR code" loading="eager" />
      </div>
    </div>
  )
}

export default App
