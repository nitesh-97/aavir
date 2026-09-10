/**
 * Guidance for sellers, shown collapsed next to the upload form.
 *
 * Deliberately concrete: the failure modes here are export-setting mistakes,
 * not taste. A build plate, a coarse CAD tessellation and a stray unit choice
 * each produce a listing that looks broken for a reason the seller cannot
 * guess from the result.
 */
export function ExportTips() {
  return (
    <details className="card group p-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
        How to export a model that looks good
        <span className="text-muted transition group-open:rotate-180">▾</span>
      </summary>

      <div className="mt-4 space-y-5 text-xs leading-relaxed text-muted">
        <section>
          <h3 className="mb-1.5 font-semibold text-text">Every upload</h3>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <b className="text-text">One model, not a build plate.</b> Delete duplicates,
              supports, rafts and brims, then export the single object. A plate is placed in the
              buyer&rsquo;s room exactly as arranged — several copies spread across a metre of
              floor.
            </li>
            <li>
              <b className="text-text">Upright and centred</b>, standing the way it will sit on a
              shelf. Print orientation lying flat on the bed is not how a buyer wants to see it.
            </li>
            <li>
              <b className="text-text">Set the real height</b> to what you actually ship. That
              figure is what AR places at true scale, so an error here misleads buyers more than
              any render ever could.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="mb-1.5 font-semibold text-text">From CAD — Fusion 360, SolidWorks, Onshape</h3>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              Export <b className="text-text">STL</b>. STEP and native CAD files hold parametric
              surfaces rather than a mesh, and choosing how finely to tessellate them is a
              judgement only you can make.
            </li>
            <li>
              Use a <b className="text-text">fine refinement</b> — surface deviation around
              0.01–0.05 mm and an angle of 5–10°. A coarse export arrives visibly faceted, and no
              amount of smoothing recovers detail the file never had.
            </li>
            <li>STL and 3MF are read as millimetres, which is what slicers work in.</li>
          </ul>
        </section>

        <section>
          <h3 className="mb-1.5 font-semibold text-text">From Blender, ZBrush or a sculpting tool</h3>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <b className="text-text">GLB gives by far the best result.</b> It is the only format
              here that carries materials and textures, so your surface detail survives. STL and
              OBJ carry geometry alone, and arrive as plain matte plastic.
            </li>
            <li>
              That is not a problem if your print really is one colour — the colour options and
              the print material you choose supply the finish instead.
            </li>
            <li>
              Decimate very dense sculpts. The converted glb has to come in under 50 MB, and a
              multi-million-triangle mesh will be slow on a phone in AR.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="mb-1.5 font-semibold text-text">From a slicer — PrusaSlicer, Bambu, Cura</h3>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              Export the <b className="text-text">model</b>, not the project or plate. A project
              file is the whole bed, including every copy and all the support geometry.
            </li>
          </ul>
        </section>
      </div>
    </details>
  );
}
