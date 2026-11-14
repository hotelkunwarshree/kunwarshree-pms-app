import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, Image, Linking, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import * as WebBrowser from 'expo-web-browser'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import { useKeepAwake } from 'expo-keep-awake'
import { AUTH_REDIRECT, AUTH_STORAGE_KEY, INSIDE_HOSTS, START_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from './src/config'
import { BRIDGE_JS, RAWBT_OK_JS, loginJS } from './src/bridge'

const MAROON = '#5c0e17'
const GOLD = '#cfae5b'
const toast = (m) => ToastAndroid.show(String(m), ToastAndroid.LONG)

const hostOf = (u) => { try { return new URL(u).host } catch { return '' } }
const isGoogleLogin = (u) => u.startsWith(SUPABASE_URL + '/auth/v1/authorize')

/* "…#access_token=…&refresh_token=…" → { access_token, … } */
function hashParams(url) {
  const out = {}
  const i = url.indexOf('#')
  const q = i >= 0 ? url.slice(i + 1) : (url.split('?')[1] || '')
  q.split('&').forEach((kv) => {
    const j = kv.indexOf('=')
    const k = j >= 0 ? kv.slice(0, j) : kv
    const v = j >= 0 ? kv.slice(j + 1) : ''
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '))
  })
  return out
}

/* 🔐 Google login — Google WebView ke andar login nahi hone deta, isliye
   phone ka asli browser (Chrome) khulta hai; login ke baad Supabase app ko
   kspms://auth/callback par tokens ke saath wapas bhejta hai. */
async function googleLogin() {
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google`
    + `&redirect_to=${encodeURIComponent(AUTH_REDIRECT)}&prompt=select_account`
  const res = await WebBrowser.openAuthSessionAsync(url, AUTH_REDIRECT)
  if (res.type !== 'success' || !res.url) return null           // user ne browser band kar diya
  const p = hashParams(res.url)
  if (p.error || p.error_description) throw new Error(p.error_description || p.error)
  if (!p.access_token || !p.refresh_token) {
    throw new Error('Login app me wapas nahi aaya — Supabase Redirect URLs me kspms://auth/callback jodein')
  }
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${p.access_token}` },
  })
  if (!r.ok) throw new Error('Login check nahi ho paya, dobara try karein')
  const user = await r.json()
  const expiresIn = Number(p.expires_in) || 3600
  return {
    access_token: p.access_token,
    refresh_token: p.refresh_token,
    token_type: p.token_type || 'bearer',
    expires_in: expiresIn,
    expires_at: Number(p.expires_at) || Math.floor(Date.now() / 1000) + expiresIn,
    ...(p.provider_token ? { provider_token: p.provider_token } : {}),
    user,
  }
}

/* ⬇ website ki file (CSV / Excel / Backup) → phone me save / share */
async function saveFile({ name, mime, base64 }) {
  const safe = String(name || 'download').replace(/[\\/:*?"<>|]+/g, '_')
  const f = new File(Paths.cache, safe)
  f.create({ overwrite: true })
  await f.write(base64, { encoding: 'base64' })
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: safe })
}

function Splash({ children }) {
  return (
    <View style={[StyleSheet.absoluteFill, s.center]}>
      <Image source={require('./assets/splash-icon.png')} style={s.logo} />
      {children}
    </View>
  )
}

function Offline({ onRetry }) {
  return (
    <Splash>
      <Text style={s.h1}>Internet nahi hai</Text>
      <Text style={s.p}>Wi-Fi ya mobile data check karein, phir dobara try karein.</Text>
      <Pressable style={s.btn} onPress={onRetry}><Text style={s.btnT}>↻  Dobara try karein</Text></Pressable>
    </Splash>
  )
}

function Shell() {
  useKeepAwake()                 // counter / kitchen par screen band na ho (order alarm sunai de)
  const web = useRef(null)
  const canBack = useRef(false)
  const printing = useRef(Promise.resolve())
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(0)

  /* 📱 Android Back — pehle website me peeche, phir app band */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canBack.current && web.current) { web.current.goBack(); return true }
      return false
    })
    return () => sub.remove()
  }, [])

  const doLogin = useCallback(async () => {
    setBusy(true)
    try {
      const session = await googleLogin()
      if (session) web.current?.injectJavaScript(loginJS(AUTH_STORAGE_KEY, session))
    } catch (e) {
      toast(e?.message || e)
    } finally {
      setBusy(false)
    }
  }, [])

  const openOutside = useCallback(async (url) => {
    try {
      await Linking.openURL(url)
      if (url.startsWith('rawbt:')) web.current?.injectJavaScript(RAWBT_OK_JS)
    } catch {
      /* rawbt na mila → website khud "RawBT install karein" batati hai */
      if (!url.startsWith('rawbt:')) toast('Ye link khul nahi saka')
    }
  }, [])

  const onShouldStart = useCallback((req) => {
    const url = req.url || ''
    if (isGoogleLogin(url)) { doLogin(); return false }
    if (/^(about|blob|data|javascript):/i.test(url)) return true
    if (/^https?:/i.test(url)) {
      if (INSIDE_HOSTS.includes(hostOf(url))) return true
      if (req.isTopFrame === false) return true            // page ke andar ka frame (map / video)
      openOutside(url)                                       // WhatsApp, Maps, Google… → bahar
      return false
    }
    openOutside(url)                                         // rawbt:, tel:, upi:, whatsapp:, intent: …
    return false
  }, [doLogin, openOutside])

  /* target="_blank" / window.open — apna page isi me, baaki bahar */
  const onOpenWindow = useCallback((e) => {
    const url = e.nativeEvent.targetUrl || ''
    if (onShouldStart({ url, isTopFrame: true })) {
      web.current?.injectJavaScript(`location.href = ${JSON.stringify(url)}; true;`)
    }
  }, [onShouldStart])

  const onMessage = useCallback((e) => {
    let m
    try { m = JSON.parse(e.nativeEvent.data) } catch { return }
    if (m.type === 'print') {
      /* har copy alag job, ek ke baad ek */
      printing.current = printing.current
        .then(() => Print.printAsync({ html: m.html }))
        .catch((err) => toast('Print nahi hua: ' + (err?.message || err)))
    } else if (m.type === 'download') {
      saveFile(m).catch((err) => toast('File save nahi hui: ' + (err?.message || err)))
    }
  }, [])

  if (offline) return <Offline onRetry={() => { setOffline(false); setKey((k) => k + 1) }} />

  return (
    <View style={{ flex: 1 }}>
      <WebView
        key={key}
        ref={web}
        source={{ uri: START_URL }}
        style={{ flex: 1 }}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_JS}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly
        onShouldStartLoadWithRequest={onShouldStart}
        onOpenWindow={onOpenWindow}
        setSupportMultipleWindows
        onNavigationStateChange={(n) => { canBack.current = n.canGoBack }}
        onMessage={onMessage}
        onError={() => setOffline(true)}
        onRenderProcessGone={() => setKey((k) => k + 1)}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowFileAccess
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        applicationNameForUserAgent="KSPMSApp/1.0"
        textZoom={100}
        overScrollMode="never"
        startInLoadingState
        renderLoading={() => <Splash><ActivityIndicator color={GOLD} size="large" /></Splash>}
      />
      {busy && (
        <View style={[StyleSheet.absoluteFill, s.center, { backgroundColor: 'rgba(92,14,23,0.9)' }]}>
          <ActivityIndicator color={GOLD} size="large" />
          <Text style={[s.p, { marginTop: 12 }]}>Google login ho raha hai…</Text>
        </View>
      )}
    </View>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: MAROON }} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <Shell />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: MAROON, padding: 24 },
  logo: { width: 160, height: 160, resizeMode: 'contain', marginBottom: 16 },
  h1: { color: GOLD, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  p: { color: '#f3e7cf', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  btn: { backgroundColor: GOLD, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 24 },
  btnT: { color: MAROON, fontWeight: '700', fontSize: 16 },
})
