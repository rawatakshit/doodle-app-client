'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Pen, Eraser, Undo2, Redo2, Trash2 } from 'lucide-react';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";
const socket = io(SOCKET_URL);

const getCursorColor = (id: string) => {
  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
  let sum = 0;
  for (let i = 0; i < id.length; i++) {
    sum += id.charCodeAt(i);
  }
  return colors[sum % colors.length];
};

export default function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#2563eb');
  const [activeTool, setActiveTool] = useState<'pen' | 'eraser'>('pen');
  const [brushSize, setBrushSize] = useState(4);
  
  const [cursors, setCursors] = useState<{ [id: string]: { x: number, y: number } }>({});
  
  const lastPos = useRef({ x: 0, y: 0 });
  const currentStrokeId = useRef<string>("");

  const redrawCanvas = (history: any[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    history.forEach((stroke) => {
      stroke.lines.forEach((line: any) => {
        // Support for the true eraser
        const isEraserLine = line.isEraser || line.color === '#ffffff'; 
        ctx.globalCompositeOperation = isEraserLine ? 'destination-out' : 'source-over';
        
        ctx.beginPath();
        // Color doesn't matter for destination-out, it just removes pixels
        ctx.strokeStyle = isEraserLine ? 'rgba(0,0,0,1)' : line.color;
        ctx.lineWidth = line.lineWidth;
        ctx.moveTo(line.x0 * canvas.width, line.y0 * canvas.height);
        ctx.lineTo(line.x1 * canvas.width, line.y1 * canvas.height);
        ctx.stroke();
      });
    });
    
    // Reset to default drawing mode just in case
    ctx.globalCompositeOperation = 'source-over';
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
      
      const isEraserLine = data.isEraser || data.color === '#ffffff';
      ctx.globalCompositeOperation = isEraserLine ? 'destination-out' : 'source-over';
      
      ctx.beginPath();
      ctx.strokeStyle = isEraserLine ? 'rgba(0,0,0,1)' : data.color;
      ctx.lineWidth = data.lineWidth; 
      ctx.moveTo(data.x0 * w, data.y0 * h);
      ctx.lineTo(data.x1 * w, data.y1 * h);
      ctx.stroke();
      
      ctx.globalCompositeOperation = 'source-over';
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

    const isEraser = activeTool === 'eraser';
    const currentLineWidth = isEraser ? 24 : brushSize;

    // Use destination-out to erase pixels, source-over to draw
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';

    ctx.beginPath();
    ctx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : color;
    ctx.lineWidth = currentLineWidth;
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();
    
    // Reset back to default
    ctx.globalCompositeOperation = 'source-over';

    socket.emit("drawing", { 
        strokeId: currentStrokeId.current,
        x0: lastPos.current.x / w, 
        y0: lastPos.current.y / h, 
        x1: currentX / w, 
        y1: currentY / h,
        color: color,
        lineWidth: currentLineWidth,
        isEraser: isEraser // Send the tool state to the server
    });

    lastPos.current = { x: currentX, y: currentY };
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    currentStrokeId.current = "";
  };

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
    <div 
      className="h-screen w-screen overflow-hidden relative font-sans"
      style={{ 
        backgroundColor: '#fafafa',
        backgroundImage: 'radial-gradient(#d4d4d8 1px, transparent 1px)', 
        backgroundSize: '24px 24px' 
      }}
    >
      
      {/* GLASSMORPHIC TOOLBAR */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-2 bg-white/80 backdrop-blur-md border border-gray-200/50 p-2 rounded-2xl shadow-xl items-center z-10 transition-all">
        
        <button 
          onClick={() => setActiveTool('pen')}
          title="Pen Tool"
          className={`p-3 rounded-xl transition-all flex items-center justify-center ${
            activeTool === 'pen' ? 'bg-blue-100 text-blue-600 shadow-sm' : 'hover:bg-gray-100 text-gray-500'
          }`}
        >
          <Pen size={20} strokeWidth={2.5} />
        </button>

        <div className={`p-1 rounded-xl transition-all ${activeTool === 'pen' ? 'bg-gray-50' : ''}`}>
          <input 
            type="color" 
            value={color} 
            title="Choose Color"
            onChange={(e) => { setColor(e.target.value); setActiveTool('pen'); }}
            className="w-8 h-8 cursor-pointer rounded-lg bg-transparent border-none block"
            style={{ padding: 0 }}
          />
        </div>

        <div className="flex items-center gap-3 px-3 mx-1 border-l border-r border-gray-200">
          <div 
            className="rounded-full bg-gray-800" 
            style={{ width: brushSize, height: brushSize, minWidth: '4px', minHeight: '4px' }}
          />
          <input 
            type="range" min="1" max="30" value={brushSize} 
            onChange={(e) => { setBrushSize(Number(e.target.value)); }}
            className="w-24 cursor-pointer accent-blue-600"
          />
        </div>

        <button 
          onClick={() => setActiveTool('eraser')}
          title="Eraser Tool"
          className={`p-3 rounded-xl transition-all flex items-center justify-center ${
            activeTool === 'eraser' ? 'bg-blue-100 text-blue-600 shadow-sm' : 'hover:bg-gray-100 text-gray-500'
          }`}
        >
          <Eraser size={20} strokeWidth={2.5} />
        </button>
        
        <div className="w-px h-8 bg-gray-200 mx-1"></div>

        <div className="flex gap-1">
          <button onClick={undo} title="Undo" className="p-3 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <Undo2 size={20} strokeWidth={2.5} />
          </button>
          <button onClick={redo} title="Redo" className="p-3 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <Redo2 size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="w-px h-8 bg-gray-200 mx-1"></div>

        <button 
          onClick={clearBoard} 
          title="Clear Canvas"
          className="p-3 rounded-xl hover:bg-red-50 text-red-500 transition-colors group flex items-center justify-center"
        >
          <Trash2 size={20} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {/* REMOTE CURSORS */}
      {Object.entries(cursors).map(([id, pos]) => {
        const cursorColor = getCursorColor(id);
        return (
          <div 
            key={id} 
            className="absolute pointer-events-none z-20 transition-all duration-75 ease-out flex flex-col items-center"
            style={{ left: pos.x, top: pos.y }}
          >
            <svg 
              width="24" 
              height="36" 
              viewBox="0 0 24 36" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-md"
              style={{ transform: 'rotate(-15deg)', transformOrigin: 'top left' }}
            >
              <path 
                d="M5.4 29.5312L0 0L24 10.9688L13.8824 14.7344L18.7059 27.6562L13.0588 30L8.23529 17.0781L5.4 29.5312Z" 
                fill={cursorColor}
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        );
      })}

      <canvas 
        ref={canvasRef} 
        className="block w-full h-full touch-none"
        style={{ cursor: activeTool === 'eraser' ? 'cell' : 'crosshair' }}
        onMouseDown={startDrawing}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onMouseMove={handleMouseMove}
      />
    </div>
  );
}
