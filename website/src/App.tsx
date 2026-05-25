import './index.css'
import TopNav from './sections/TopNav'
import Hero from './sections/Hero'
import Downloads from './sections/Downloads'
import PainPoints from './sections/PainPoints'
import Features from './sections/Features'
import WhatGetsCaptured from './sections/WhatGetsCaptured'
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
      <Downloads />
      <PainPoints />
      <Features />
      <WhatGetsCaptured />
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
