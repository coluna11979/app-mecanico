/**
 * Renderiza um documento legal (termos, privacidade) a partir de markdown
 * simplificado. Sem dependência externa — entende headings, parágrafos,
 * listas, tabelas básicas, negrito, itálico e links.
 *
 * Não é um parser markdown completo, mas cobre o suficiente pros nossos
 * documentos legais sem inflar bundle.
 */
interface Props {
  content: string;
}

export function LegalDoc({ content }: Props) {
  const blocks = content.trim().split(/\n\n+/);

  return (
    <div className="prose prose-steel max-w-none text-steel-800 leading-relaxed space-y-4 text-[15px]">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

function renderBlock(block: string, key: number) {
  const lines = block.split('\n');
  const first = lines[0]?.trim() ?? '';

  // Heading 1 (#)
  if (first.startsWith('# ')) {
    return <h1 key={key} className="text-3xl font-bold tracking-tight mt-8 mb-2 text-steel-900">{inline(first.slice(2))}</h1>;
  }
  // Heading 2 (##)
  if (first.startsWith('## ')) {
    return <h2 key={key} className="text-2xl font-bold tracking-tight mt-7 mb-2 text-steel-900 pb-1.5 border-b border-steel-200">{inline(first.slice(3))}</h2>;
  }
  // Heading 3 (###)
  if (first.startsWith('### ')) {
    return <h3 key={key} className="text-lg font-bold mt-5 mb-1 text-steel-800">{inline(first.slice(4))}</h3>;
  }
  // HR
  if (first === '---') {
    return <hr key={key} className="my-6 border-steel-200" />;
  }
  // Tabela markdown
  if (first.startsWith('|') && lines[1]?.startsWith('|')) {
    return renderTable(lines, key);
  }
  // Lista (-)
  if (first.startsWith('- ')) {
    return (
      <ul key={key} className="list-disc list-outside pl-6 space-y-1.5 my-3">
        {lines.filter(l => l.startsWith('- ')).map((l, i) => (
          <li key={i} className="leading-relaxed">{inline(l.slice(2))}</li>
        ))}
      </ul>
    );
  }
  // Lista numerada
  if (/^\d+\.\s/.test(first)) {
    return (
      <ol key={key} className="list-decimal list-outside pl-6 space-y-1.5 my-3">
        {lines.filter(l => /^\d+\.\s/.test(l.trim())).map((l, i) => (
          <li key={i} className="leading-relaxed">{inline(l.trim().replace(/^\d+\.\s/, ''))}</li>
        ))}
      </ol>
    );
  }
  // Parágrafo
  return <p key={key} className="leading-relaxed">{inline(block)}</p>;
}

function renderTable(lines: string[], key: number) {
  // Linha 0: headers, Linha 1: separator (|---|---|), Linha 2+: data
  const parseRow = (l: string): string[] =>
    l.split('|').slice(1, -1).map(c => c.trim());

  const headers = parseRow(lines[0]);
  const rows    = lines.slice(2).filter(l => l.trim().startsWith('|')).map(parseRow);

  return (
    <div key={key} className="overflow-x-auto my-4 -mx-1">
      <table className="min-w-full text-sm border-collapse rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-steel-100">
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 font-bold text-steel-700 text-xs uppercase tracking-wider">
                {inline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-steel-100">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-steel-50/50">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 align-top">{inline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renderiza inline: **negrito**, *itálico*, [link](url).
 * Implementação simples sem regex aninhada complexa.
 */
function inline(text: string): React.ReactNode {
  // Pre-processa: substitui as marcações por placeholders únicos
  const parts: Array<string | React.ReactNode> = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Negrito **texto**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/s);
    // Itálico *texto* (não confundir com **)
    const italicMatch = remaining.match(/^(.*?)(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/s);
    // Link [texto](url)
    const linkMatch   = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)/s);

    // Pega o match mais "à esquerda"
    const candidates = [
      boldMatch && { type: 'bold', match: boldMatch },
      italicMatch && { type: 'italic', match: italicMatch },
      linkMatch && { type: 'link', match: linkMatch },
    ].filter(Boolean) as { type: string; match: RegExpMatchArray }[];

    if (candidates.length === 0) {
      parts.push(remaining);
      break;
    }

    const winner = candidates.reduce((a, b) => (a.match[1].length <= b.match[1].length ? a : b));
    const before = winner.match[1];
    if (before) parts.push(before);

    if (winner.type === 'bold') {
      parts.push(<strong key={key++} className="font-bold text-steel-900">{winner.match[2]}</strong>);
    } else if (winner.type === 'italic') {
      parts.push(<em key={key++} className="italic">{winner.match[2]}</em>);
    } else if (winner.type === 'link') {
      const url = winner.match[3];
      const isExternal = url.startsWith('http');
      parts.push(
        <a key={key++} href={url}
          className="text-brand-600 hover:underline font-medium"
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
        >
          {winner.match[2]}
        </a>
      );
    }

    remaining = remaining.slice(winner.match[0].length);
  }

  return <>{parts}</>;
}
