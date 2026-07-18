'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";
const socket = io(SOCKET_URL);

export default function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [isEraser, setIsEraser] = useState(false);
  const [brushSize, setBrushSize] = useState(3);
  
  const [cursors, setCursors] = useState<{ [id: string]: { x: number, y: number } }>({});
  
  const lastPos = useRef({ x: 0, y: 0 });
  const currentStrokeId = useRef<string>("");

  const redrawCanvas = (history: any[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear everything before redrawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    history.forEach((stroke) => {
      stroke.lines.forEach((line: any) => {
        ctx.beginPath();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.lineWidth;
        ctx.moveTo(line.x0 * canvas.width, line.y0 * canvas.height);
        ctx.lineTo(line.x1 * canvas.width, line.y1 * canvas.height);
        ctx.stroke();
      });
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    socket.on("init-history", (history) => redrawCanvas(history));
    socket.on("update-canvas", (history) => redrawCanvas(history));

    socket.on("drawing", (data) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.beginPath();
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.lineWidth; 
      ctx.moveTo(data.x0 * w, data.y0 * h);
      ctx.lineTo(data.x1 * w, data.y1 * h);
      ctx.stroke();
    });

    socket.on("cursor-move", (data) => {
      setCursors(prev => ({
        ...prev,
        [data.id]: { x: data.x * window.innerWidth, y: data.y * window.innerHeight }
      }));
    });

    socket.on("cursor-remove", (id) => {
      setCursors(prev => {
        const newCursors = { ...prev };
        delete newCursors[id];
        return newCursors;
      });
    });

    socket.on("clear", () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // You can implement an emit to request history again on resize if needed
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.off("init-history");
      socket.off("update-canvas");
      socket.off("drawing");
      socket.off("cursor-move");
      socket.off("cursor-remove");
      socket.off("clear");
    };
  }, []);

  const startDrawing = (e: React.MouseEvent) => {
    setIsDrawing(true);
    const newStrokeId = Date.now().toString() + Math.random().toString(36).substring(2);
    currentStrokeId.current = newStrokeId;
    
    socket.emit("start-stroke", newStrokeId);
    lastPos.current = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const currentX = e.nativeEvent.offsetX;
    const currentY = e.nativeEvent.offsetY;
    const w = window.innerWidth;
    const h = window.innerHeight;

    socket.emit("cursor-move", { x: currentX / w, y: currentY / h });

    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentColor = isEraser ? '#ffffff' : color; 
    const currentLineWidth = isEraser ? 20 : brushSize;

    ctx.beginPath();
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentLineWidth;
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();

    socket.emit("drawing", { 
        strokeId: currentStrokeId.current,
        x0: lastPos.current.x / w, 
        y0: lastPos.current.y / h, 
        x1: currentX / w, 
        y1: currentY / h,
        color: currentColor,
        lineWidth: currentLineWidth
    });

    lastPos.current = { x: currentX, y: currentY };
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    currentStrokeId.current = "";
  };

  // IMMEDIATE LOCAL CLEAR
  const clearBoard = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }
    socket.emit("clear");
  };

  const undo = () => socket.emit("undo");
  const redo = () => socket.emit("redo");

  return (
    <div className="h-screen w-screen bg-white overflow-hidden relative font-sans">
      
      {/* TOOLBAR */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-4 bg-white border border-gray-200 p-3 rounded-xl shadow-lg items-center z-10">
        
        <button 
          onClick={() => setIsEraser(false)}
          className={`px-4 py-2 font-bold rounded-lg transition-colors ${
            !isEraser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Pen
        </button>

        <input 
          type="color" 
          value={color} 
          onChange={(e) => { setColor(e.target.value); setIsEraser(false); }}
          className="w-10 h-10 cursor-pointer rounded bg-transparent border-none"
        />

        <div className="flex items-center gap-2 px-2 border-l border-r border-gray-300">
          <span className="text-sm font-medium text-gray-500 w-8 text-center">{brushSize}px</span>
          <input 
            type="range" min="1" max="30" value={brushSize} 
            onChange={(e) => { setBrushSize(Number(e.target.value)); setIsEraser(false); }}
            className="w-24 cursor-pointer accent-blue-600"
          />
        </div>

        <button 
          onClick={() => setIsEraser(true)}
          className={`px-4 py-2 font-bold rounded-lg transition-colors ${
            isEraser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Eraser
        </button>
        
        <div className="w-px h-8 bg-gray-300 mx-2"></div>

        <button onClick={undo} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors">
          Undo
        </button>
        <button onClick={redo} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors">
          Redo
        </button>

        <div className="w-px h-8 bg-gray-300 mx-2"></div>

        <button onClick={clearBoard} className="px-4 py-2 bg-red-50 hover:text-red-700 hover:bg-red-100 text-red-600 font-bold rounded-lg transition-colors">
          Clear
        </button>
      </div>

      {/* CURSORS */}
      {Object.entries(cursors).map(([id, pos]) => (
        <div 
          key={id} 
          className="absolute pointer-events-none z-20 flex items-center justify-center transition-all duration-75"
          style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
        >
          <div className="w-4 h-4 bg-red-500 rounded-full shadow-md border-2 border-white"></div>
        </div>
      ))}

      <canvas 
        ref={canvasRef} 
        className="cursor-crosshair block w-full h-full"
        onMouseDown={startDrawing}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onMouseMove={handleMouseMove}
      />
    </div>
  );
}
