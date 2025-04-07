main().catch(console.error);

async function main() {
    const { device, context, canvas, format } = await initWebGPU();
    const { vertexBuffer, indexBuffer, indexCount } = icoSphere(device);

    const { texture, sampler } = await createTexture(device, './texture.jpg');

    const shaderSource = await fetch('./texmesh.wgsl').then(r => r.text());

    // Create pipeline
    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: device.createShaderModule({ code: shaderSource }),
            entryPoint: 'vs_main',
            buffers: [{
                arrayStride: 20,
                attributes: [
                    { format: 'float32x3', offset: 0,  shaderLocation: 0 },
                    { format: 'float32x2', offset: 12, shaderLocation: 1 }
                ]
            }]
        },
        fragment: {
            module: device.createShaderModule({ code: shaderSource }),
            entryPoint: 'fs_main',
            targets: [{ format }]
        },
        primitive: { topology: 'triangle-list', cullMode: 'back' },
    });

    // Create uniform buffer
    const uniformBuffer = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // Create bind group
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: sampler },
            { binding: 2, resource: texture.createView() }
        ]
    });

    let aspect = canvas.width / canvas.height;
    const projectionMatrix = new Float32Array(16);
    mat4.perspective(projectionMatrix, Math.PI/2, aspect, 0.1, 100);

    const viewMatrix = new Float32Array(16);
    mat4.lookAt(viewMatrix, [1.5, 1.5, 1.5], [0,0,0], [0,1,0]);

    const modelMatrix = new Float32Array(16);
    mat4.identity(modelMatrix);

    const mvp = new Float32Array(16);
    function updateTransformation() {        
        mat4.rotateX(modelMatrix, modelMatrix, 0.01);
        mat4.rotateY(modelMatrix, modelMatrix, 0.003);
        mat4.rotateZ(modelMatrix, modelMatrix, 0.008);
        mat4.mul(mvp, projectionMatrix, viewMatrix);
        mat4.mul(mvp, mvp, modelMatrix);
        device.queue.writeBuffer(uniformBuffer, 0, mvp);
    }

    function render() {
        updateTransformation();

        const commandEncoder = device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: [0.1, 0.1, 0.1, 1],
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);
        renderPass.setVertexBuffer(0, vertexBuffer);
        renderPass.setIndexBuffer(indexBuffer, 'uint16');
        renderPass.drawIndexed(indexCount);

        renderPass.end();
        device.queue.submit([commandEncoder.finish()]);
        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}

async function initWebGPU() {
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU not supported');

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No adapter found');
    const device = await adapter.requestDevice();

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    return { device, canvas, context, format };
}

async function createTexture(device, url) {
    const response = await fetch(url);
    const imageBitmap = await createImageBitmap(await response.blob());
    
    const texture = device.createTexture({
        size: [imageBitmap.width, imageBitmap.height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | 
               GPUTextureUsage.COPY_DST |
               GPUTextureUsage.RENDER_ATTACHMENT
    });

    device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture },
        [imageBitmap.width, imageBitmap.height]
    );

    // Create sampler
    const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear'
    });

    return { texture, sampler };
}

function icoSphere(device) {
    const phi = (1 + Math.sqrt(5)) / 2;

    // Generate initial vertices (normalized)
    const rawVertices = [
        [-1,  phi, 0], [1,  phi, 0], [-1, -phi, 0], [1, -phi, 0],
        [0, -1,  phi], [0, 1,  phi], [0, -1, -phi], [0, 1, -phi],
        [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
    ];

    const project = (raw) => {
        const length = Math.sqrt(raw[0]**2 + raw[1]**2 + raw[2]**2);
        const x = raw[0]/length;
        const y = raw[1]/length;
        const z = raw[2]/length;
        const u = 0.5 + Math.atan2(z, x) / (2 * Math.PI);
        const v = Math.acos(y) / Math.PI;
        return [x, y, z, 0.25 + u / 2, 0.25 + v / 2];
    };

    const vertices = new Float32Array(rawVertices.map(project).flat());

    const vertexBuffer = device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(vertices);
    vertexBuffer.unmap();

    // Initial faces (indices from three.js IcosahedronGeometry)
    const indices = new Uint16Array([
        0, 11, 5,  0, 5, 1,  0, 1, 7,  0, 7, 10,  0, 10, 11,
        1, 5, 9,   5, 11, 4, 11, 10, 2, 10, 7, 6,  7, 1, 8,
        3, 9, 4,   3, 4, 2,  3, 2, 6,  3, 6, 8,   3, 8, 9,
        4, 9, 5,   2, 4, 11, 6, 2, 10, 8, 6, 7,   9, 8, 1
    ]);

    const indexBuffer = device.createBuffer({
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Uint16Array(indexBuffer.getMappedRange()).set(indices);
    indexBuffer.unmap();

    return { vertexBuffer, indexBuffer, indexCount: indices.length };
}