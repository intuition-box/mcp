/**
 * ENS Resolution for Intuition MCP Server
 *
 * Allows users to search by ENS names (vitalik.eth) instead of just addresses.
 * Uses viem for proper ENS resolution on Ethereum mainnet.
 */

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth.llamarpc.com')
});

export interface AddressResolution {
  address: string | null;
  isENS: boolean;
  ensName?: string;
  error?: string;
}

/**
 * Resolves ENS names or validates Ethereum addresses
 * @param input - ENS name (e.g., "vitalik.eth") or Ethereum address (e.g., "0x...")
 * @returns Resolution result with address, ENS status, and any errors
 */
export async function resolveAddressOrENS(input: string): Promise<AddressResolution> {
  const cleaned = input.trim();

  // Check if it's already an address
  if (cleaned.startsWith('0x') && cleaned.length === 42) {
    return {
      address: cleaned.toLowerCase(),
      isENS: false
    };
  }

  // Try to resolve as ENS
  if (cleaned.includes('.')) {
    try {
      const normalizedName = normalize(cleaned);
      const address = await publicClient.getEnsAddress({ name: normalizedName });

      if (address) {
        return {
          address: address.toLowerCase(),
          isENS: true,
          ensName: normalizedName
        };
      }

      return {
        address: null,
        isENS: true,
        ensName: normalizedName,
        error: 'ENS name not found or not registered'
      };
    } catch (error) {
      return {
        address: null,
        isENS: true,
        ensName: cleaned,
        error: 'Failed to resolve ENS name'
      };
    }
  }

  return {
    address: null,
    isENS: false,
    error: 'Invalid input. Please enter an Ethereum address (0x...) or ENS name (vitalik.eth)'
  };
}

/**
 * Fallback ENS resolution using public API
 * Used as backup if viem resolution fails
 */
export async function resolveENSViaAPI(ensName: string): Promise<string | null> {
  try {
    const cleanName = ensName.trim().toLowerCase();

    // Use public ENS API
    const response = await fetch(`https://api.ensideas.com/ens/resolve/${cleanName}`);
    const data = await response.json();

    if (data.address) {
      return data.address;
    }

    return null;
  } catch (error) {
    console.error('ENS API resolution error:', error);
    return null;
  }
}
