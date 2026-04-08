import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation | Intuition MCP",
  description:
    "Complete guide to the Intuition MCP monorepo — installation, Claude Desktop integration, tool reference, and algorithm documentation for the Intuition MCP and Trust Score MCP servers.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
