export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md mx-4 bg-white rounded-3xl shadow-xl p-8 text-center">
        <div className="text-7xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Sayfa Bulunamadı</h1>
        <p className="text-gray-500 text-sm mb-6">Aradığın sayfa mevcut değil veya taşınmış olabilir.</p>
        <a
          href="/"
          className="inline-block bg-emerald-500 text-white font-semibold px-6 py-3 rounded-full text-sm hover:bg-emerald-600 transition-colors"
        >
          Ana Sayfaya Dön
        </a>
      </div>
    </div>
  );
}
