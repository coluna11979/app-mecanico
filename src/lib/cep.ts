/** Busca de endereço pelo CEP (ViaCEP). */

export type CepAddress = { street: string; neighborhood: string; city: string; state: string };

/** null = CEP não existe; lança erro se a busca falhar (rede/ViaCEP fora). */
export async function lookupCep(cep: string): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  const data = await res.json();
  if (data.erro) return null;
  return {
    street:       data.logradouro ?? '',
    neighborhood: data.bairro ?? '',
    city:         data.localidade ?? '',
    state:        (data.uf ?? '').toUpperCase(),
  };
}
