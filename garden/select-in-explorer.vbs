Option Explicit

Dim target, folderPath, fileName, fso, shell, attempt, window
If WScript.Arguments.Count <> 1 Then WScript.Quit 2
target = WScript.Arguments(0)
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(target) Then WScript.Quit 3
folderPath = fso.GetParentFolderName(target)
fileName = fso.GetFileName(target)
Set shell = CreateObject("Shell.Application")

shell.Explore folderPath
For attempt = 1 To 50
    For Each window In shell.Windows
        If SelectFile(window, folderPath, fileName) Then WScript.Quit 0
    Next
    WScript.Sleep 100
Next
WScript.Quit 4

Function SelectFile(window, folderPath, fileName)
    Dim view, item, selected
    SelectFile = False
    On Error Resume Next
    Set view = window.Document
    If Err.Number <> 0 Then Exit Function
    If StrComp(view.Folder.Self.Path, folderPath, vbTextCompare) <> 0 Then Exit Function
    Set item = view.Folder.ParseName(fileName)
    If item Is Nothing Then Exit Function
    ' Select, deselect other items, scroll into view, and focus the file.
    view.SelectItem item, 29
    If Err.Number <> 0 Then Exit Function
    For Each selected In view.SelectedItems
        If StrComp(selected.Path, item.Path, vbTextCompare) = 0 Then
            SelectFile = True
            Exit Function
        End If
    Next
End Function
