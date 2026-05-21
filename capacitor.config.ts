import type { CapacitorConfig } from '@capacitor/cli'

// ──────────────────────────────────────────────────────────────────────────────
// SysVetMax — Configuração do empacotamento nativo (Capacitor)
//
// Estratégia: WebView "thin client" apontando para a produção Vercel.
// Preserva App Router, Server Actions, Supabase SSR auth e API routes sem
// precisar converter o app para static export.
//
// Override local: defina CAPACITOR_SERVER_URL no .env.local para testar com
// `npm run dev` apontando para o dev server (ex.: http://192.168.0.10:4000).
// ──────────────────────────────────────────────────────────────────────────────

const SERVER_URL =
  process.env.CAPACITOR_SERVER_URL ?? 'https://sysvetmax.sysmaxsolutions.com'

const isCustomLocal = SERVER_URL.startsWith('http://')

const config: CapacitorConfig = {
  appId: 'com.sysmaxsolutions.vetmax',
  appName: 'SysVetMax',
  webDir: 'public/capacitor-shell',

  // Aponta o WebView diretamente para o backend Next.js da Vercel.
  // O atributo `androidScheme: 'https'` garante que cookies SameSite=Lax do
  // Supabase auth sejam aceitos pelo WebView Android (caso contrário seriam
  // tratados como cross-origin e perderíamos a sessão).
  server: {
    url: SERVER_URL,
    androidScheme: 'https',
    iosScheme: 'https',
    // Permite tráfego em texto-puro apenas se o usuário configurou um host HTTP
    // (cenário de desenvolvimento na rede local).
    cleartext: isCustomLocal,
    allowNavigation: [
      '*.supabase.co',
      '*.supabase.in',
      'sysvetmax.sysmaxsolutions.com',
      '*.sysmaxsolutions.com',
      '*.vercel.app',
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Plugins
  // ──────────────────────────────────────────────────────────────────────────
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff',
      overlaysWebView: false,
    },
    KeepAwake: {
      // No-op aqui — o controle real é por componente (ConsultationDetail,
      // TriageForm, etc.) via hook useNativeKeepAwake.
    },
    SpeechRecognition: {
      // Permissões nativas (microfone + reconhecimento) são solicitadas em
      // tempo de uso pelo wrapper de voz. Strings de privacidade ficam no
      // Info.plist (iOS) e no strings.xml (Android).
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Android
  // ──────────────────────────────────────────────────────────────────────────
  android: {
    // Permite que o WebView envie cookies para o backend Vercel.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // iOS
  // ──────────────────────────────────────────────────────────────────────────
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    backgroundColor: '#ffffff',
    limitsNavigationsToAppBoundDomains: false,
  },
}

export default config
