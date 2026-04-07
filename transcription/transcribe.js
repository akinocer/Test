/**
 * Fonction serverless — Vercel (Edge compatible) ou Netlify Functions
 * Déploiement Vercel  : placer dans /api/transcribe.js  → disponible sur /api/transcribe
 * Déploiement Netlify : placer dans /netlify/functions/transcribe.js
 *                       et ajuster l'URL dans index.html → /.netlify/functions/transcribe
 *
 * Variable d'environnement requise (à définir dans le dashboard Vercel/Netlify) :
 *   GROQ_API_KEY=gsk_xxxxxxxxxxxx
 */

export const config = { runtime: 'edge' };   // Supprimer cette ligne pour Netlify

export default async function handler(req) {

  /* ── CORS : autoriser uniquement votre domaine en production ── */
  const allowedOrigins = [
    'https://abilan-lab.vercel.app',   // ← remplacer par votre domaine réel
    'http://localhost:3000',
    'http://127.0.0.1:5500',
  ];
  const origin = req.headers.get('origin') || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin':  corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Vary': 'Origin',
  };

  // Répondre aux pre-flight OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /* ── Récupération de la clé API depuis les variables d'env ── */
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: 'Clé API Groq non configurée sur le serveur.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /* ── Mode admin : vérification du token optionnel ── */
  const adminToken = req.headers.get('X-Admin-Token');
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';   // facultatif

  // Si un token admin est fourni, il doit être valide
  if (adminToken && ADMIN_TOKEN && adminToken !== ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Token admin invalide.' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    /* ── Lecture du body (multipart/form-data provenant du front) ── */
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return new Response(JSON.stringify({ error: 'Content-Type attendu : multipart/form-data' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // On relit le body brut et on le redirige tel quel vers Groq
    const formData = await req.formData();

    // Paramètres par défaut (peuvent être surchargés par le client)
    if (!formData.has('model'))           formData.set('model', 'whisper-large-v3-turbo');
    if (!formData.has('response_format')) formData.set('response_format', 'verbose_json');
    if (!formData.has('language'))        formData.set('language', 'fr');

    /* ── Appel Groq Whisper ── */
    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY },
      body:    formData,
    });

    const groqBody = await groqRes.text();

    if (!groqRes.ok) {
      let errMsg = `Groq API: ${groqRes.status}`;
      try { errMsg = JSON.parse(groqBody)?.error?.message || errMsg; } catch (_) {}
      return new Response(JSON.stringify({ error: errMsg }), {
        status: groqRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(groqBody, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[transcribe] Erreur interne:', err);
    return new Response(JSON.stringify({ error: 'Erreur interne du serveur.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
