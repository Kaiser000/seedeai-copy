package com.seede.model.dto;

/**
 * 通用 API 响应包装类
 *
 * <p>用于非 SSE 接口（如健康检查、未来的同步接口）的统一响应格式。
 * 目前主要场景：SSE 接口直接使用 {@link com.seede.model.SseMessage}，
 * 此类供需要标准 JSON 响应的接口使用。</p>
 *
 * <p>响应格式示例：</p>
 * <pre>
 * // 成功
 * {"code": 200, "data": {...}, "message": "success"}
 *
 * // 失败
 * {"code": 500, "data": null, "message": "内部服务器错误"}
 * </pre>
 *
 * @param <T> 响应数据的类型
 */
public class ApiResponse<T> {

    /** HTTP 语义状态码（200=成功，4xx=客户端错误，5xx=服务端错误） */
    private int code;

    /** 响应数据，失败时为 null */
    private T data;

    /** 响应描述，成功时为 "success"，失败时为具体错误信息 */
    private String message;

    /** 私有构造器，强制通过静态工厂方法创建实例，保证语义明确 */
    private ApiResponse(int code, T data, String message) {
        this.code = code;
        this.data = data;
        this.message = message;
    }

    /**
     * 创建成功响应（code=200, message="success"）。
     *
     * @param data 响应数据
     */
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(200, data, "success");
    }

    /**
     * 创建带自定义消息的成功响应（code=200）。
     *
     * @param data    响应数据
     * @param message 自定义成功描述
     */
    public static <T> ApiResponse<T> success(T data, String message) {
        return new ApiResponse<>(200, data, message);
    }

    /**
     * 创建失败响应（data=null）。
     *
     * @param code    错误状态码（如 400、500）
     * @param message 错误描述
     */
    public static <T> ApiResponse<T> error(int code, String message) {
        return new ApiResponse<>(code, null, message);
    }

    public int getCode() { return code; }
    public void setCode(int code) { this.code = code; }
    public T getData() { return data; }
    public void setData(T data) { this.data = data; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
