// Încărcarea modulelor mari (ex. generatorul de PDF) la cerere. După un deploy nou, o pagină rămasă deschisă cere fișiere care nu mai există;
// în loc de eroarea tehnică, afișăm un mesaj clar (fără reîncărcare automată, ca să nu se piardă ce ai completat).
export async function lazy(load) {
  try {
    return await load()
  } catch (e) {
    if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(String(e?.message || e))) {
      throw new Error('Aplicația a fost actualizată între timp. Salvează ce ai completat, apoi reîncarcă pagina (Ctrl+Shift+R) și încearcă din nou.')
    }
    throw e
  }
}
