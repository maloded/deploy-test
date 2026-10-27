import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { isLanguage } from "@/lib/languages";
import { getSite, isDev, themeSwitcherEnabled } from "@/lib/site";
import { loadLayout } from "@/product-types/layouts";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound();
  const switcher = themeSwitcherEnabled();
  const override = switcher ? ((await headers()).get("x-theme-override") ?? null) : null;
  const site = getSite(lang, override);
  const Layout = await loadLayout(site.product.productType);

  return (
    <>
      <Layout site={site} />
      {switcher && <ThemeSwitcher themes={site.availableThemes} current={site.theme} warnings={isDev ? site.warnings : []} />}
    </>
  );
}
