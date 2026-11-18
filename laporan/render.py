import sys, uno, subprocess, time, os
from com.sun.star.beans import PropertyValue
def pv(n,v):
    p=PropertyValue(); p.Name=n; p.Value=v; return p
src, pdf, docx_out = [os.path.abspath(a) for a in sys.argv[1:4]]
proc=subprocess.Popen(['soffice','--headless','--invisible','--norestore','--accept=socket,host=localhost,port=2083;urp;'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
ctx=None
for _ in range(60):
    try:
        local=uno.getComponentContext(); r=local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',local)
        ctx=r.resolve('uno:socket,host=localhost,port=2083;urp;StarOffice.ComponentContext'); break
    except Exception: time.sleep(0.5)
desk=ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',ctx)
doc=desk.loadComponentFromURL(uno.systemPathToFileUrl(src),'_blank',0,(pv('Hidden',True),))
for _ in range(2):
    idx=doc.getDocumentIndexes()
    for i in range(idx.getCount()): idx.getByIndex(i).update()
    doc.refresh()
doc.storeToURL(uno.systemPathToFileUrl(pdf),(pv('FilterName','writer_pdf_Export'),))
doc.storeToURL(uno.systemPathToFileUrl(docx_out),(pv('FilterName','MS Word 2007 XML'),))
doc.close(True)
try: desk.terminate()
except Exception: pass
proc.wait(timeout=30)
