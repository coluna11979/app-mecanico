// Assinatura da MecânicoApp no fim de todos os e-mails (logo + slogan).
// Mesmo slogan do app: src/components/BrandSignature.tsx.
// A logo é PNG (Gmail/Outlook não mostram SVG), servida pelo site: public/brand/logo-email.png.

export const BRAND_SLOGAN = 'Tecnologia que conecta';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Bloco HTML da assinatura (tabela: é o que todo cliente de e-mail respeita) */
export function signatureHtml(appUrl: string): string {
  const base = appUrl.replace(/\/$/, '');
  const site = base.replace(/^https?:\/\//, '');
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;border-top:1px solid #EEF1F5;width:100%;">
        <tr><td style="padding-top:20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:middle;padding-right:12px;">
                <a href="${esc(base)}" style="text-decoration:none;">
                  <img src="${esc(base)}/brand/logo-email.png" width="44" height="44" alt="MecânicoApp" style="display:block;border:0;border-radius:10px;">
                </a>
              </td>
              <td style="vertical-align:middle;">
                <div style="font-size:16px;font-weight:800;color:#0B1117;letter-spacing:-0.2px;line-height:1.2;">Mecânico<span style="color:#FF5C0A;">App</span></div>
                <div style="font-size:12px;color:#7A8797;margin-top:2px;line-height:1.3;">${BRAND_SLOGAN}</div>
                <a href="${esc(base)}" style="font-size:11px;color:#9AA6B6;text-decoration:none;">${esc(site)}</a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>`;
}

/** Versão em texto puro (parte "text" do e-mail) */
export function signatureText(appUrl: string): string {
  return `—\nMecânicoApp · ${BRAND_SLOGAN}\n${appUrl.replace(/\/$/, '').replace(/^https?:\/\//, '')}`;
}
