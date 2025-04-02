/**
 * WebGPU multiview rendering - drawing a colorful bg for
 * 24 canvases (this is almost impossible with WebGL AFAIK).
 * 
 * Remember, for now (spring of 2025), browsers poorly support
 * WebGPU so consider run this from localhost in case of 
 * browser restrictions.
 */

async function main() {
    const canvases = [];
    for (let i = 0; i < 24; i++) {
        const c = document.createElement('canvas');
        c.width = 300;
        c.height = 300;
        c.style.margin = '8px';
        
        canvases.push(c);
        document.body.appendChild(c);
    }
    const { device, format } = await initWebGPU(canvases[0]);
    for (const canvas of canvases) {
        const context = canvas.getContext('webgpu');
        if (!context) throw new Error('WebGPU not supported');
        context.configure({ device, format, alphaMode: 'opaque' });
    }
    
    for (const canvas of canvases) {
        const context = canvas.getContext('webgpu');
        if (!context) throw new Error('WebGPU not supported');
        context.configure({ device, format, alphaMode: 'opaque' });
    }
    
    function render() {
        const t = (performance.now() / 1000);
        const commandEncoder = device.createCommandEncoder();
        const colorAttachments = [];
        let d = 1;
        for (let i = 0; i < canvases.length; i++) {
            d *= 1.1;
            const canvas = canvases[i];
            const context = canvas.getContext('webgpu');
            colorAttachments.push({
                view: context.getCurrentTexture().createView(),
                clearValue: [
                    Math.abs(Math.sin(t / d)),
                    Math.abs(Math.sin(t / (d * 2))),
                    Math.abs(Math.sin(t / (d * 3))),
                    1
                ],
                loadOp: 'clear',
                storeOp: 'store'
            });
            
            // For now renderPass does not accept more than 4 colorAttachments
            // in a single render pass. So we just create a new renderPass for
            // every 4 canvases.
            if (colorAttachments.length > 3) {
                const renderPass = commandEncoder.beginRenderPass({
                    colorAttachments,
                });        
                renderPass.end();
                colorAttachments.splice(0, colorAttachments.length);
            }
        }
        device.queue.submit([commandEncoder.finish()]);
        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}

async function initWebGPU(canvas) {
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU not supported');

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No adapter found');
    const device = await adapter.requestDevice();

    const format = navigator.gpu.getPreferredCanvasFormat();

    return { device, canvas, format };
}

main().catch(console.error);