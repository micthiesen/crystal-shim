"""Render reloaded STEP exports, with separately labelled PCB/stencil envelopes."""

import cadquery as cq
import vtk

from build import BOARDS, CLEARANCE, DEPTH, FLOOR, OUT, TOP, block, pcb_blank


def actor(shape, color):
    vertices, faces = shape.tessellate(0.04, 0.08)
    points = vtk.vtkPoints()
    for p in vertices:
        points.InsertNextPoint(*p.toTuple())
    cells = vtk.vtkCellArray()
    for face in faces:
        cells.InsertNextCell(3)
        for i in face:
            cells.InsertCellPoint(i)
    data = vtk.vtkPolyData()
    data.SetPoints(points)
    data.SetPolys(cells)
    normals = vtk.vtkPolyDataNormals()
    normals.SetInputData(data)
    normals.SetFeatureAngle(35)
    normals.ConsistencyOn()
    normals.AutoOrientNormalsOn()
    mapper = vtk.vtkPolyDataMapper()
    mapper.SetInputConnection(normals.GetOutputPort())
    result = vtk.vtkActor()
    result.SetMapper(mapper)
    result.GetProperty().SetColor(*color)
    result.GetProperty().SetAmbient(0.3)
    result.GetProperty().SetDiffuse(0.7)
    return result


def label(renderer, text, x, y, size=22):
    a = vtk.vtkTextActor()
    a.SetInput(text)
    a.GetPositionCoordinate().SetCoordinateSystemToNormalizedViewport()
    a.SetPosition(x, y)
    a.GetTextProperty().SetFontSize(size)
    a.GetTextProperty().SetColor(0.12, 0.18, 0.23)
    renderer.AddViewProp(a)


def stencil_outline(board):
    w, h = board.stencil
    points = vtk.vtkPoints()
    line = vtk.vtkPolyLine()
    line.GetPointIds().SetNumberOfIds(5)
    for i, (x, y) in enumerate([(-w/2, -h/2), (w/2, -h/2), (w/2, h/2), (-w/2, h/2), (-w/2, -h/2)]):
        points.InsertNextPoint(x, y, TOP + 0.08)
        line.GetPointIds().SetId(i, i)
    cells = vtk.vtkCellArray()
    cells.InsertNextCell(line)
    data = vtk.vtkPolyData()
    data.SetPoints(points)
    data.SetLines(cells)
    mapper = vtk.vtkPolyDataMapper()
    mapper.SetInputData(data)
    a = vtk.vtkActor()
    a.SetMapper(mapper)
    a.GetProperty().SetColor(0.1, 0.35, 0.8)
    a.GetProperty().SetLineWidth(2.5)
    return a


def scene(window, viewport, objects, focal, scale, position=None):
    ren = vtk.vtkRenderer()
    ren.SetViewport(*viewport)
    ren.SetBackground(0.96, 0.97, 0.98)
    for shape, color in objects:
        ren.AddActor(actor(shape, color))
    cam = ren.GetActiveCamera()
    cam.SetFocalPoint(*focal)
    cam.SetPosition(*(position or (focal[0] + 90, focal[1] - 140, focal[2] + 210)))
    cam.SetViewUp(0, 0, 1)
    cam.ParallelProjectionOn()
    cam.SetParallelScale(scale)
    window.AddRenderer(ren)
    return ren


def write(window, path):
    window.Render()
    for ren in window.GetRenderers():
        ren.ResetCameraClippingRange()
    window.Render()
    capture = vtk.vtkWindowToImageFilter()
    capture.SetInput(window)
    capture.Update()
    writer = vtk.vtkPNGWriter()
    writer.SetFileName(str(path))
    writer.SetInputConnection(capture.GetOutputPort())
    writer.Write()
    window.Finalize()
    print(path.name, flush=True)


def window(size):
    result = vtk.vtkRenderWindow()
    result.SetOffScreenRendering(1)
    result.SetSize(*size)
    result.SetMultiSamples(8)
    return result


def main():
    colors = [(0.67, 0.77, 0.83), (0.72, 0.78, 0.86), (0.63, 0.8, 0.71)]
    overview = window((2100, 900))
    for i, (board, color) in enumerate(zip(BOARDS, colors)):
        tray = cq.importers.importStep(str(OUT / f"{board.name}-tray.step")).val()
        ren = scene(overview, (i/3, 0, (i+1)/3, 1), [(tray, color)], (0, 0, 1.5), board.tray * 0.98)
        ren.AddActor(stencil_outline(board))
        label(ren, board.name.upper(), 0.07, 0.92, 28)
        label(ren, f"{board.tray} x {board.tray} x {TOP:g} mm", 0.07, 0.87)
        label(ren, f"Pocket: {board.width + 2 * CLEARANCE:g} x {board.height + 2 * CLEARANCE:g} x {DEPTH:g} mm", 0.07, 0.12, 20)
        label(ren, f"Blue outline: {board.stencil[0]:g} x {board.stencil[1]:g} stencil", 0.07, 0.08, 20)
        label(ren, "Flat bottom on bed / PETG / no supports", 0.07, 0.04, 18)
    write(overview, OUT / "preview.png")

    detail = window((1800, 900))
    board = BOARDS[2]
    tray = cq.importers.importStep(str(OUT / "sensor-tray.step")).val()
    clip_crop = block(6, 16, -5, 23, -1, 7)
    ren = scene(detail, (0, 0, 0.5, 1), [(tray.intersect(clip_crop), colors[2])],
                (10.5, 9, 2.4), 20, (48, -65, 105))
    label(ren, "SPRING DETAIL", 0.06, 0.92, 28)
    label(ren, "1.2 mm beam / 20 mm free length", 0.06, 0.87)
    label(ren, "Through slot frees the spring from the floor.", 0.06, 0.09, 20)
    label(ren, "Tab top is 0.4 mm below the stencil plane.", 0.06, 0.05, 20)
    section = block(-17, 17, 5, 8, -1, 7)
    shim = cq.importers.importStep(str(OUT / "sensor-shim-0.2mm.step")).val().translate((0, 0, FLOOR))
    ren = scene(detail, (0.5, 0, 1, 1), [
        (tray.intersect(section), colors[2]),
        (pcb_blank(board).intersect(section), (0.22, 0.25, 0.28)),
        (shim.intersect(section), (0.95, 0.65, 0.22)),
    ], (0, 6.5, 2.4), 22, (4, -85, 46))
    label(ren, "NOMINAL FLUSH SEAT", 0.06, 0.92, 28)
    label(ren, "Section through floor and a bare PCB envelope", 0.06, 0.87, 20)
    label(ren, "Dark: 1.6 mm PCB / amber: 0.2 mm shim", 0.06, 0.09, 20)
    label(ren, "Adjust shim to actual board and printed depth.", 0.06, 0.05, 20)
    write(detail, OUT / "details.png")


if __name__ == "__main__":
    main()
