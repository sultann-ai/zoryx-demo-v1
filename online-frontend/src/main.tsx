import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CartProvider } from './cart/CartProvider'
import { LanguageProvider } from './i18n'
import { queryClient } from './lib/queryClient'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <CartProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </CartProvider>
      </QueryClientProvider>
    </LanguageProvider>
  </StrictMode>,
)
