import { headers } from "next/headers";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { getSite, isDev, themeSwitcherEnabled } from "@/lib/site";
import { loadLayout } from "@/product-types/layouts";

export default async function Page() {
  const switcher = themeSwitcherEnabled();
  const override = switcher ? ((await headers()).get("x-theme-override") ?? null) : null;
  const site = getSite(override);
  const Layout = await loadLayout(site.product.productType);

  return (
    <>
      <Layout site={site} />
      {switcher && <ThemeSwitcher themes={site.availableThemes} current={site.theme} warnings={isDev ? site.warnings : []} />}
    </>
  );
}
