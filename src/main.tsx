import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { ThemeProvider } from "@/components/theme-provider"
import { UIModeProvider } from "@/providers/UIModeContext"
import { Toaster } from "@/components/ui/sonner"
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <UIModeProvider>
        <BrowserRouter>
          <TRPCProvider>
            <App />
            <Toaster />
          </TRPCProvider>
        </BrowserRouter>
      </UIModeProvider>
    </ThemeProvider>
  </StrictMode>,
)
