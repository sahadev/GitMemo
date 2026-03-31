import './index.css'
import Hero from './sections/Hero'
import PainPoints from './sections/PainPoints'
import Features from './sections/Features'
import WhatGetsCaptured from './sections/WhatGetsCaptured'
import HowItWorks from './sections/HowItWorks'
import Comparison from './sections/Comparison'
import DesktopApp from './sections/DesktopApp'
import QuickStart from './sections/QuickStart'
import Footer from './sections/Footer'

function App() {
  return (
    <div className="min-h-screen">
      <Hero />
      <PainPoints />
      <Features />
      <WhatGetsCaptured />
      <HowItWorks />
      <Comparison />
      <DesktopApp />
      <QuickStart />
      <Footer />
    </div>
  )
}

export default App
