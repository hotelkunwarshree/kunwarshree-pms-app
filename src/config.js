/* Kunwar Shree PMS app — settings.
   App sirf ek "khidki" hai: andar wahi live website chalti hai
   (https://hotelkunwarshree.com/pms). Website par jo naya feature aata hai,
   wo app me apne aap aa jata hai — naya APK nahi banana padta. */

export const SITE = 'https://hotelkunwarshree.com'
export const START_URL = SITE + '/pms'

/* Supabase — wahi jo website use karti hai. Ye "anon" (public) key hai,
   jo website ke andar bhi khuli hoti hai; isse koi data nahi khulta —
   data RLS + staff_users se band hai. Service/secret key yahan KABHI nahi. */
export const SUPABASE_URL = 'https://vxnkqupremijmwdvmexd.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4bmtxdXByZW1pam13ZHZtZXhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Njk4MzQsImV4cCI6MjEwMjM0NTgzNH0.1pwk9xE00v-EcHGxSEptYJL0KQIRq-gJyz5j0yFG5c4'

/* website (supabase-js) session yahan rakhti hai — login ke baad app yahi bharta hai */
export const AUTH_STORAGE_KEY = 'sb-vxnkqupremijmwdvmexd-auth-token'

/* Google login ke baad browser isi pate par app ko wapas bulata hai.
   Supabase → Authentication → URL Configuration → Redirect URLs me jodna zaroori. */
export const AUTH_REDIRECT = 'kspms://auth/callback'

/* in domains ke page app ke andar khulte hain; baaki (Google Maps, WhatsApp…) bahar */
export const INSIDE_HOSTS = ['hotelkunwarshree.com', 'www.hotelkunwarshree.com', 'vxnkqupremijmwdvmexd.supabase.co']
