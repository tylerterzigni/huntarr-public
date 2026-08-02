import { requireAuth } from "@/lib/auth/session";
import { MainLayout } from "@/components/layout/MainLayout";
import { getTmdbApiKey } from "@/lib/settings/global";
import { OrderedHomeRows } from "@/components/home/OrderedHomeRows";
import { WarmPersonalizeOnHome } from "@/components/home/WarmPersonalizeOnHome";
import { getHomeRowOrder } from "@/lib/home/get-home-row-order";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireAuth();
  const tmdbConfigured = Boolean(await getTmdbApiKey());
  const rowOrder = await getHomeRowOrder(session.user.id);

  return (
    <MainLayout username={session.user.name}>
      <div className="pt-0 pb-6 md:py-8">
        <WarmPersonalizeOnHome />
        {!tmdbConfigured && (
          <div className="mx-4 md:mx-8 mb-8 rounded-lg border border-gray-300/70 bg-white/40 p-4 text-sm text-gray-700 backdrop-blur-md">
            TMDB is not configured yet. Add your API key in{" "}
            <a href="/settings" className="underline text-gray-900 hover:text-gray-700">
              Settings → General
            </a>{" "}
            to browse movies and TV.
          </div>
        )}
        <OrderedHomeRows
          userId={session.user.id}
          tmdbConfigured={tmdbConfigured}
          order={rowOrder}
        />
      </div>
    </MainLayout>
  );
}
