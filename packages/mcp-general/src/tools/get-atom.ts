import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { graphqlClient, gql } from "../lib/graphql-client.js";

const GetAtomSchema = z.object({
  id: z.string().describe("The atom ID to retrieve"),
});

const GET_ATOM_QUERY = gql`
  query GetAtom($id: numeric!) {
    atom(id: $id) {
      id
      label
      type
      emoji
      image
      data
      vault {
        totalShares
        currentSharePrice
        positionCount
      }
      creator {
        id
        label
      }
      asSubject {
        id
        label
        predicate {
          id
          label
        }
        object {
          id
          label
        }
        vault {
          positionCount
        }
        counterVault {
          positionCount
        }
      }
      blockTimestamp
    }
  }
`;

interface GetAtomResponse {
  atom: {
    id: string;
    label: string;
    type: string;
    emoji: string | null;
    image: string | null;
    data: string | null;
    vault: {
      totalShares: string;
      currentSharePrice: string;
      positionCount: number;
    } | null;
    creator: {
      id: string;
      label: string | null;
    } | null;
    asSubject: Array<{
      id: string;
      label: string | null;
      predicate: { id: string; label: string | null };
      object: { id: string; label: string | null };
      vault: { positionCount: number } | null;
      counterVault: { positionCount: number } | null;
    }>;
    blockTimestamp: string;
  } | null;
}

export function registerGetAtom(server: McpServer): void {
  server.tool(
    "get_atom",
    "Get detailed information about a specific atom by ID, including its vault stats, creator, and all triples where it appears as subject.",
    GetAtomSchema.shape,
    async (params) => {
      const { id } = GetAtomSchema.parse(params);

      try {
        const data = await graphqlClient.request<GetAtomResponse>(
          GET_ATOM_QUERY,
          { id: parseInt(id, 10) }
        );

        if (!data.atom) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Atom with ID "${id}" not found.`,
              },
            ],
          };
        }

        const atom = data.atom;
        const result = {
          id: atom.id,
          label: atom.label,
          type: atom.type,
          emoji: atom.emoji,
          positions: atom.vault?.positionCount ?? 0,
          totalShares: atom.vault?.totalShares ?? "0",
          sharePrice: atom.vault?.currentSharePrice ?? "0",
          creator: atom.creator?.label ?? atom.creator?.id ?? "unknown",
          timestamp: atom.blockTimestamp,
          triples: atom.asSubject.map((t) => ({
            id: t.id,
            predicate: t.predicate.label ?? t.predicate.id,
            object: t.object.label ?? t.object.id,
            forPositions: t.vault?.positionCount ?? 0,
            againstPositions: t.counterVault?.positionCount ?? 0,
          })),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching atom: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}