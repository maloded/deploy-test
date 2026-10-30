import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { isLanguage } from "@/lib/languages";
import { getSite, isDev, themeSwitcherEnabled } from "@/lib/site";
import { loadLayout } from "@/product-types/layouts";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound(); // safety net, unreachable while dynamicParams = false in layout.tsx (see the comment there)
  const switcher = themeSwitcherEnabled();
  const override = switcher ? ((await headers()).get("x-theme-override") ?? null) : null;
  const site = getSite(lang, override);
  const Layout = await loadLayout(site.product.productType);

  return (
    <>
      <JsonLd site={site} />
      <Layout site={site} />
      {switcher && <ThemeSwitcher themes={site.availableThemes} current={site.theme} warnings={isDev ? site.warnings : []} />}
    </>
  );
}
