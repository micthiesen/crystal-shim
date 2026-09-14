# MOV sourcing and alternative fit

Reviewed 2026-09-14. No MOV ordered and no PCB/fabrication change made.

## Exact part

No confirmed quantity-one source for TMOV14RP175EL2T7 was found.

- [Mouser Canada](https://www.mouser.ca/en/ProductDetail/Littelfuse/TMOV14RP175EL2T7?qs=PalBzRKzfntz9V2gxzK2yg%3D%3D): native browser catalog showed non-stocked, 16 weeks, minimum 1500, multiple 500.
- [Newark Canada](https://canada.newark.com/littelfuse/tmov14rp175el2t7/thermally-protected-varistor-14mm/dp/01P8102): full-reel minimum 1500, available to order rather than verified shelf stock.
- [DIRECT](https://www.direct.fr/radial/2976-a.html): indexed listing specifies a 500-piece lot and contact-only ordering; not a verified small-quantity offer.
- DigiKey and LCSC listings showed no exact-part stock. No stocked offer was established through Arrow, Avnet, RS or TME searches; absence from search is not proof they cannot source it.
- [OMO](https://www.omo-ic.com/chip/366/tmov14rp175el2t7-littelfuse.html): quote-only generic availability alongside zero-stock distributor feeds. Quantity-one fulfillment and traceability are unverified. No inquiry sent.
- No purchasable L2B7 packaging-only equivalent was established.

## Stocked alternative

[Mouser Canada TMOV14RP175E](https://www.mouser.ca/en/ProductDetail/Littelfuse/TMOV14RP175E?qs=nXjUL3qLHyWPDWqKl1H7NA%3D%3D), SKU 576-TMOV14RP175E: native browser showed 2 in stock, minimum 1, CAD 2.81 each. This is page evidence, not a cart reservation.

Electrical function and ratings match the selected family member; the lead form changes. The [manufacturer family datasheet](https://www.littelfuse.com/assetdocs/tmov-itmov?assetguid=bd475732-1071-4352-b8aa-f78b0007eb05) and [existing footprint/assembly contract](../docs/design/mov-capture.md) give:

- Existing 1.3 mm round hole and 3.7 x 1.3 mm slot, 7.5 mm centre spacing.
- Bulk lead diameter 0.76..0.86 mm; lead spacing components 6.5..8.5 mm and 1.5..4.0 mm.
- Unformed lead-pair span 6.671..9.394 mm. Worst-tolerance footprint capacity, including 0.10 mm differential position error, is 8.940 mm. Worst-case shortfall is 0.454 mm.
- Required yaw can reach 31.61 degrees, exceeding the existing 20-degree assembly limit. Some individual bulk parts can fit unchanged, but the published range does not guarantee it.
- Reducing transverse stagger to at most 2 mm would restore the accepted geometric fit calculation: span at most 8.732 mm, yaw at most 17.10 degrees and 0.208 mm margin. At the worst transverse stagger this is approximately 1 mm movement per lead if shared symmetrically.

That geometric calculation does not qualify a forming process. No applicable manufacturer bend-radius/body-setback procedure was found for this thermally protected device. Published dimensions also do not guarantee the complete installed body location. A particular bulk part can be accepted without a footprint change only after stress-free unpowered fit within the existing 27 x 27 mm occupied envelope, 26 mm height and insulation limits is established. No forming recipe or substitution is approved by this note.

The bulk part is a conditional procurement fallback, not a guaranteed drop-in. A footprint change remains a possible next decision if guaranteed full-tolerance compatibility is required. The owner asked to consider that only after exact sourcing and alternative-fit review; this review does not authorize or perform a footprint change.
