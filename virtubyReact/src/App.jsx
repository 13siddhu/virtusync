import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
    <header>
        <div class="logo">
            <svg width="50" height="50" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="#00a8ff" opacity="0.7" />
                <path d="M35 30 L65 50 L35 70 Z" fill="white" />
            </svg>
            <h1>VIRTUSYNC</h1>
        </div>
        
        <div class="header-text">SEAMLESS, SECURE, SMART</div>
        
        <div class="cta-buttons">
            <button class="cta-button cta-primary">Login</button>
            <button class="cta-button cta-secondary">SignUp</button>
        </div>
    </header>
    
        
    </>
  )
}

export default App
