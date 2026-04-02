/**
 * BrandSwitcher.tsx — compatibility shim.
 *
 * The component has been renamed MerchantSwitcher and now reads from
 * BrandContext instead of the deprecated DashboardContext Brand type.
 *
 * This file is a simple re-export so any leftover imports of BrandSwitcher
 * continue to compile while the migration is in progress. Once all import
 * sites have been updated to import MerchantSwitcher directly, this file
 * can be deleted.
 *
 * @deprecated Import MerchantSwitcher instead.
 */

export { default } from "./MerchantSwitcher";
