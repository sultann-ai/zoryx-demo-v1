# Sends a file of raw bytes to a named Windows printer as a RAW spooler job, via winspool.drv
# P/Invoke. No native Node module, no node-gyp/Visual Studio build tools required — this is
# what print-agent/src/windowsRawPrinter.ts spawns for the `printer:NAME` interface case.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File send-raw-print.ps1 -PrinterName "EPSON TM-T88" -FilePath "C:\path\to\job.bin"

param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = false)]
    public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter")]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = false)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter")]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter")]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter")]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter")]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
        {
            throw new InvalidOperationException("OpenPrinter failed for \"" + printerName + "\" (not found, or not RAW-capable). Win32 error: " + Marshal.GetLastWin32Error());
        }

        try
        {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "Zoryx receipt";
            di.pDataType = "RAW";

            if (StartDocPrinter(hPrinter, 1, di) == 0)
            {
                throw new InvalidOperationException("StartDocPrinter failed. Win32 error: " + Marshal.GetLastWin32Error());
            }
            try
            {
                if (!StartPagePrinter(hPrinter))
                {
                    throw new InvalidOperationException("StartPagePrinter failed. Win32 error: " + Marshal.GetLastWin32Error());
                }

                IntPtr unmanagedBytes = Marshal.AllocHGlobal(bytes.Length);
                try
                {
                    Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);
                    int written;
                    if (!WritePrinter(hPrinter, unmanagedBytes, bytes.Length, out written))
                    {
                        throw new InvalidOperationException("WritePrinter failed. Win32 error: " + Marshal.GetLastWin32Error());
                    }
                    if (written != bytes.Length)
                    {
                        throw new InvalidOperationException("WritePrinter only wrote " + written + " of " + bytes.Length + " bytes.");
                    }
                }
                finally
                {
                    Marshal.FreeHGlobal(unmanagedBytes);
                }

                EndPagePrinter(hPrinter);
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            ClosePrinter(hPrinter);
        }

        return true;
    }
}
"@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
[RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes)
Write-Output "OK"
