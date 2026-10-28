package com.facebook.react.bridge;
public interface Promise {
  void resolve(Object value);
  default void reject(String code, String message) { throw new IllegalStateException(code + ": " + message); }
}
