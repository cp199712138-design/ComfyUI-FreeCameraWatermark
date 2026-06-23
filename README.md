# ComfyUI-FreeCameraWatermark

轻量相机水印节点。支持文字、Logo、相机白条、透明水印和简单图案。

不需要 pip，不需要 comfy-env。

## 安装

下载：

```text
dist/ComfyUI-FreeCameraWatermark.zip
```

解压后，把整个文件夹放到：

```text
ComfyUI/custom_nodes/ComfyUI-FreeCameraWatermark
```

重启 ComfyUI，搜索：

```text
自由相机水印
```

也可以搜索英文：

```text
Free Camera Watermark
```

## 怎么用

1. 连接主图到 `image`。
2. 如果用签名或 Logo，连接图片到 `logo`，透明通道连接到 `logo_mask`。
3. 选择 `模式`。
4. 在节点里的蓝色框上拖动位置，拉右下角缩放。

常用模式：

- `相机白条`：底部白条加相机参数。
- `Logo`：只添加签名或 Logo。
- `Logo+文字`：Logo 和文字一起放。
- `透明水印`：低透明度水印。
- `图案水印`：生成简单装饰图案，不联网下载。

## 小提示

- `自动` 位置一般不用改。
- `透明度`：0 是看不见，255 是不透明。
- 颜色写法：`#ffffff`、`#000000`。
- 字体选 `默认` 最稳；`手写 / 优雅 / 科技` 是内置字体。

## 说明

这个节点只把水印合成到图片像素里，不上传文件，也不清理图片元数据。
